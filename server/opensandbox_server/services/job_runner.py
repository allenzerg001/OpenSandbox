"""Async job workflow orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

import httpx

from opensandbox_server.services.job_models import JobRecord, JobStatus, JobStep
from opensandbox_server.services.job_repository import JobRepository

logger = logging.getLogger(__name__)

# Internal server base URL for calling sandbox/access-key APIs
_SERVER_BASE_URL = "http://127.0.0.1:8080"

# Timeouts
_SANDBOX_READY_TIMEOUT_S = 120
_SANDBOX_POLL_INTERVAL_S = 3


class JobRunner:
    """Executes the AI coding job workflow as an async background task."""

    def __init__(self, job_repo: JobRepository, access_key_repo) -> None:
        self._job_repo = job_repo
        self._access_key_repo = access_key_repo

    async def run(self, job: JobRecord) -> None:
        """Execute the full job workflow. Updates job record at each step."""
        try:
            job.status = JobStatus.RUNNING
            self._save(job)

            # Step 1: Create sandbox
            sandbox_id = await self._create_sandbox(job)
            if sandbox_id is None:
                job.status = JobStatus.FAILED
                job.current_step = JobStep.CREATING_SANDBOX.value
                job.error = job.error or "Failed to create or start sandbox"
                self._save(job)
                return
            job.sandbox_id = sandbox_id

            # Steps 2-5
            steps = [
                (JobStep.GIT_PULL, self._step_git_pull),
                (JobStep.WRITING_KEYS, self._step_write_keys),
                (JobStep.RUNNING_CLI, self._step_run_cli),
                (JobStep.GIT_PUSH, self._step_git_push),
            ]

            for step, fn in steps:
                job.current_step = step.value
                self._save(job)
                try:
                    await fn(job)
                except Exception as e:
                    logger.exception(f"Job {job.id} failed at step {step.value}")
                    await self._pause_sandbox(job.sandbox_id)
                    job.status = JobStatus.PAUSED
                    job.error = f"Step {step.value} failed: {str(e)[:500]}"
                    self._save(job)
                    return

            # Step 6: Destroy
            job.current_step = JobStep.DESTROYING.value
            self._save(job)
            await self._destroy_sandbox(job.sandbox_id)
            job.status = JobStatus.SUCCEEDED
            job.error = None
            self._save(job)

        except Exception as e:
            logger.exception(f"Job {job.id} unexpected error")
            job.status = JobStatus.FAILED
            job.error = f"Unexpected: {str(e)[:500]}"
            self._save(job)

    def _save(self, job: JobRecord) -> None:
        job.updated_at = datetime.now(timezone.utc)
        self._job_repo.update(job)

    async def _create_sandbox(self, job: JobRecord) -> str | None:
        """Create sandbox from snapshot and wait until Running."""
        async with httpx.AsyncClient(base_url=_SERVER_BASE_URL, timeout=30) as client:
            resp = await client.post("/v1/sandboxes", json={
                "snapshotId": job.snapshot_id,
            })
            if resp.status_code not in (200, 201, 202):
                job.error = f"Create sandbox returned {resp.status_code}: {resp.text[:200]}"
                return None
            sandbox_id = resp.json().get("id")
            if not sandbox_id:
                return None

            # Poll until Running
            elapsed = 0
            while elapsed < _SANDBOX_READY_TIMEOUT_S:
                await asyncio.sleep(_SANDBOX_POLL_INTERVAL_S)
                elapsed += _SANDBOX_POLL_INTERVAL_S
                r = await client.get(f"/v1/sandboxes/{sandbox_id}")
                if r.status_code == 200:
                    state = r.json().get("status", {}).get("state", "")
                    if state == "Running":
                        return sandbox_id
                    if state in ("Failed", "Terminated"):
                        job.error = f"Sandbox reached state {state}"
                        return None

            job.error = "Sandbox did not reach Running within timeout"
            return None

    async def _exec_command(self, sandbox_id: str, command: str, timeout: int = 120) -> str:
        """Execute a command in sandbox via execd proxy. Returns stdout. Raises on failure."""
        url = f"{_SERVER_BASE_URL}/v1/sandboxes/{sandbox_id}/proxy/44772/command"
        body = {"command": command, "timeout": timeout * 1000}  # execd uses ms

        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=30, read=None, write=30, pool=None)) as client:
            async with client.stream("POST", url, json=body, headers={"Accept": "text/event-stream"}) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"execd returned {resp.status_code}")

                stdout_parts = []
                stderr_parts = []
                async for line in resp.aiter_lines():
                    data = line
                    if line.startswith("data:"):
                        data = line[5:]
                    data = data.strip()
                    if not data:
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    etype = event.get("type", "")
                    if etype == "stdout":
                        stdout_parts.append(event.get("text", ""))
                    elif etype == "stderr":
                        stderr_parts.append(event.get("text", ""))
                    elif etype == "error":
                        raise RuntimeError(f"execd error: {event.get('evalue', '')}")
                    elif etype == "execution_complete":
                        break

        return "".join(stdout_parts)

    async def _upload_file(self, sandbox_id: str, path: str, content: str) -> None:
        """Upload a file to sandbox via execd proxy."""
        url = f"{_SERVER_BASE_URL}/v1/sandboxes/{sandbox_id}/proxy/44772/files/upload"
        metadata = json.dumps({"path": path})
        files = {
            "metadata": ("metadata", metadata, "application/json"),
            "file": ("file", content.encode(), "application/octet-stream"),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, files=files)
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"File upload failed: {resp.status_code} {resp.text[:200]}")

    async def _step_git_pull(self, job: JobRecord) -> None:
        cmd = f"git clone {job.repo_url} /workspace && cd /workspace && git checkout {job.repo_branch}"
        await self._exec_command(job.sandbox_id, cmd, timeout=120)

    async def _step_write_keys(self, job: JobRecord) -> None:
        """Fetch access keys for the provider and write .env to /workspace."""
        all_keys = self._access_key_repo.list_all()
        matched = [k for k in all_keys if k.provider == job.provider]
        if not matched:
            raise RuntimeError(f"No access keys found for provider '{job.provider}'")

        lines = []
        provider_upper = job.provider.upper()
        if len(matched) == 1:
            key = matched[0]
            lines.append(f"{provider_upper}_API_KEY={key.api_key}")
            if key.base_url:
                lines.append(f"{provider_upper}_BASE_URL={key.base_url}")
        else:
            for i, key in enumerate(matched, 1):
                lines.append(f"{provider_upper}_API_KEY_{i}={key.api_key}")
                if key.base_url:
                    lines.append(f"{provider_upper}_BASE_URL_{i}={key.base_url}")

        env_content = "\n".join(lines) + "\n"
        await self._upload_file(job.sandbox_id, "/workspace/.env", env_content)

    async def _step_run_cli(self, job: JobRecord) -> None:
        """Execute the target CLI (currently mocked)."""
        await self._exec_command(job.sandbox_id, "echo 'mock cli done'", timeout=300)

    async def _step_git_push(self, job: JobRecord) -> None:
        """Use qodercli to commit and then push."""
        await self._exec_command(
            job.sandbox_id,
            "cd /workspace && qodercli /commit && git push",
            timeout=120,
        )

    async def _pause_sandbox(self, sandbox_id: str) -> None:
        """Pause sandbox on error."""
        try:
            async with httpx.AsyncClient(base_url=_SERVER_BASE_URL, timeout=30) as client:
                await client.post(f"/v1/sandboxes/{sandbox_id}/pause")
        except Exception:
            logger.warning(f"Failed to pause sandbox {sandbox_id}", exc_info=True)

    async def _destroy_sandbox(self, sandbox_id: str) -> None:
        """Delete sandbox after success."""
        try:
            async with httpx.AsyncClient(base_url=_SERVER_BASE_URL, timeout=30) as client:
                await client.delete(f"/v1/sandboxes/{sandbox_id}")
        except Exception:
            logger.warning(f"Failed to destroy sandbox {sandbox_id}", exc_info=True)
