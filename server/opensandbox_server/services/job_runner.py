"""Async job workflow orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx

from opensandbox_server.services.job_models import JobRecord, JobStatus, JobStep
from opensandbox_server.services.job_repository import JobRepository

logger = logging.getLogger(__name__)

# Internal server base URL for calling sandbox lifecycle APIs
_SERVER_BASE_URL = "http://127.0.0.1:8080"

# Timeouts
_SANDBOX_READY_TIMEOUT_S = 120
_SANDBOX_POLL_INTERVAL_S = 3
_EXECD_READY_TIMEOUT_S = 40
_EXECD_POLL_INTERVAL_S = 2


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

            # Step 1: Create sandbox and get execd base URL
            job.current_step = JobStep.CREATING_SANDBOX.value
            self._save(job)
            result = await self._create_sandbox(job)
            if result is None:
                job.status = JobStatus.FAILED
                job.error = job.error or "Failed to create or start sandbox"
                self._save(job)
                return
            sandbox_id, execd_base_url = result
            job.sandbox_id = sandbox_id
            self._save(job)

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
                    await fn(job, execd_base_url)
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

    async def _create_sandbox(self, job: JobRecord) -> tuple[str, str] | None:
        """Create sandbox from snapshot, wait until Running, resolve execd endpoint."""
        async with httpx.AsyncClient(base_url=_SERVER_BASE_URL, timeout=30) as client:
            resp = await client.post("/v1/sandboxes", json={
                "snapshotId": job.snapshot_id,
                "resourceLimits": {
                    "cpu": "1",
                    "memory": "512Mi",
                },
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
                        break
                    if state in ("Failed", "Terminated"):
                        job.error = f"Sandbox reached state {state}"
                        return None
            else:
                job.error = "Sandbox did not reach Running within timeout"
                return None

            # Resolve execd endpoint (direct connection, bypass proxy)
            ep_resp = await client.get(f"/v1/sandboxes/{sandbox_id}/endpoints/44772")
            if ep_resp.status_code != 200:
                job.error = f"Failed to get execd endpoint: {ep_resp.status_code}"
                return None
            endpoint = ep_resp.json().get("endpoint", "")
            if not endpoint:
                job.error = "Empty execd endpoint"
                return None
            execd_base_url = f"http://{endpoint}"

            # Wait for execd to be ready (direct connection)
            await self._wait_for_execd(execd_base_url)
            return sandbox_id, execd_base_url

    async def _wait_for_execd(self, execd_base_url: str) -> None:
        """Wait for execd daemon to be ready via direct connection."""
        max_attempts = int(_EXECD_READY_TIMEOUT_S / _EXECD_POLL_INTERVAL_S)
        async with httpx.AsyncClient(timeout=5) as client:
            for i in range(max_attempts):
                try:
                    resp = await client.get(f"{execd_base_url}/ping")
                    if resp.status_code == 200:
                        logger.info(f"execd ready after {i * _EXECD_POLL_INTERVAL_S}s")
                        return
                except Exception:
                    pass
                await asyncio.sleep(_EXECD_POLL_INTERVAL_S)
        logger.warning(f"execd ping did not return 200 after {_EXECD_READY_TIMEOUT_S}s, proceeding anyway")

    async def _exec_command(self, execd_base_url: str, command: str, timeout: int = 120) -> str:
        """Execute a command in sandbox via direct execd connection. Returns stdout."""
        body = {"command": command, "timeout": timeout * 1000}  # execd uses ms

        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=30, read=None, write=30, pool=None)) as client:
            async with client.stream("POST", f"{execd_base_url}/command", json=body, headers={"Accept": "text/event-stream"}) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"execd returned {resp.status_code}")

                stdout_parts = []
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
                    elif etype == "error":
                        raise RuntimeError(f"execd error: {event.get('evalue', '')}")
                    elif etype == "execution_complete":
                        break

        return "".join(stdout_parts)

    async def _upload_file(self, execd_base_url: str, path: str, content: str) -> None:
        """Upload a file to sandbox via direct execd connection."""
        metadata = json.dumps({"path": path})
        files = {
            "metadata": ("metadata", metadata, "application/json"),
            "file": ("file", content.encode(), "application/octet-stream"),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{execd_base_url}/files/upload", files=files)
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"File upload failed: {resp.status_code} {resp.text[:200]}")

    async def _step_git_pull(self, job: JobRecord, execd_base_url: str) -> None:
        cmd = f"git clone {job.repo_url} /workspace && cd /workspace && git checkout {job.repo_branch}"
        await self._exec_command(execd_base_url, cmd, timeout=120)

    async def _step_write_keys(self, job: JobRecord, execd_base_url: str) -> None:
        """Fetch access keys for the provider and write .env.local to /workspace."""
        all_keys = self._access_key_repo.list_all()
        matched = [k for k in all_keys if k.provider == job.provider]
        if not matched:
            raise RuntimeError(f"No access keys found for provider '{job.provider}'")

        lines = []
        for i, key in enumerate(matched, 1):
            lines.append(f"QODER_TOKEN{i:02d}={key.api_key}")

        env_content = "\n".join(lines) + "\n"
        await self._upload_file(execd_base_url, "/workspace/.env.local", env_content)

    async def _step_run_cli(self, job: JobRecord, execd_base_url: str) -> None:
        """Execute the target CLI (currently mocked)."""
        await self._exec_command(execd_base_url, "echo 'mock cli done'", timeout=300)

    async def _step_git_push(self, job: JobRecord, execd_base_url: str) -> None:
        """Use qodercli to commit and then push."""
        await self._exec_command(
            execd_base_url,
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
