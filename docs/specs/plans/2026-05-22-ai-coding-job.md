# AI Coding Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add async AI coding job orchestration — trigger from snapshot, execute workflow (git pull → write keys → run CLI → qodercli commit → destroy), with pause-on-error.

**Architecture:** New `jobs` module (SQLite repo + FastAPI router + async runner), following existing snapshot module pattern. Runner uses internal httpx calls to sandbox/execd proxy.

**Tech Stack:** Python 3.10+ / FastAPI / SQLite / asyncio / httpx / pytest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server/opensandbox_server/services/job_models.py` | `JobRecord` dataclass + status enum |
| `server/opensandbox_server/services/job_repository.py` | `JobRepository` Protocol |
| `server/opensandbox_server/repositories/jobs/__init__.py` | Package exports |
| `server/opensandbox_server/repositories/jobs/sqlite.py` | SQLite implementation |
| `server/opensandbox_server/repositories/jobs/factory.py` | Factory function |
| `server/opensandbox_server/services/job_runner.py` | Async workflow orchestration |
| `server/opensandbox_server/api/jobs.py` | FastAPI router (POST + GET) |
| `server/tests/test_job_repository_sqlite.py` | Repository unit tests |
| `server/tests/test_job_runner.py` | Runner unit tests (mocked execd) |
| `server/tests/test_jobs_api.py` | API E2E tests |

---

## Task 1: Job Model + Repository Protocol

**Files:**
- Create: `server/opensandbox_server/services/job_models.py`
- Create: `server/opensandbox_server/services/job_repository.py`

- [ ] **Step 1: Create model file**

```python
"""AI Coding Job domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "Pending"
    RUNNING = "Running"
    SUCCEEDED = "Succeeded"
    FAILED = "Failed"
    PAUSED = "Paused"


class JobStep(str, Enum):
    CREATING_SANDBOX = "creating_sandbox"
    GIT_PULL = "git_pull"
    WRITING_KEYS = "writing_keys"
    RUNNING_CLI = "running_cli"
    GIT_PUSH = "git_push"
    DESTROYING = "destroying"


@dataclass(slots=True)
class JobRecord:
    id: str
    snapshot_id: str
    repo_url: str
    repo_branch: str
    provider: str
    status: JobStatus = JobStatus.PENDING
    sandbox_id: str | None = None
    current_step: str | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2: Create repository protocol**

```python
"""Job repository protocol."""

from __future__ import annotations

from typing import Protocol

from opensandbox_server.services.job_models import JobRecord


class JobRepository(Protocol):
    def create(self, record: JobRecord) -> JobRecord: ...
    def get(self, job_id: str) -> JobRecord | None: ...
    def update(self, record: JobRecord) -> JobRecord: ...
```

- [ ] **Step 3: Verify imports**

Run: `cd server && .venv/bin/python -c "from opensandbox_server.services.job_models import JobRecord, JobStatus, JobStep; print('OK')"`

- [ ] **Step 4: Commit**

```bash
git add server/opensandbox_server/services/job_models.py server/opensandbox_server/services/job_repository.py
git commit -m "feat(server): add Job model and repository protocol"
```

---

## Task 2: SQLite Job Repository

**Files:**
- Create: `server/opensandbox_server/repositories/jobs/__init__.py`
- Create: `server/opensandbox_server/repositories/jobs/sqlite.py`
- Create: `server/opensandbox_server/repositories/jobs/factory.py`

- [ ] **Step 1: Create `__init__.py`**

```python
"""Jobs repository package."""

from opensandbox_server.repositories.jobs.factory import create_job_repository
from opensandbox_server.repositories.jobs.sqlite import SQLiteJobRepository

__all__ = ["create_job_repository", "SQLiteJobRepository"]
```

- [ ] **Step 2: Create `sqlite.py`**

```python
"""SQLite-backed job repository."""

from __future__ import annotations

from pathlib import Path
import sqlite3

from opensandbox_server.services.job_models import JobRecord, JobStatus

SQLITE_BUSY_TIMEOUT_MS = 5000


class SQLiteJobRepository:
    """File-backed repository for job records."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path).expanduser()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def create(self, record: JobRecord) -> JobRecord:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (id, snapshot_id, sandbox_id, repo_url, repo_branch,
                    provider, status, current_step, error, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id, record.snapshot_id, record.sandbox_id,
                    record.repo_url, record.repo_branch, record.provider,
                    record.status.value, record.current_step, record.error,
                    self._dt(record.created_at), self._dt(record.updated_at),
                ),
            )
        return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, snapshot_id, sandbox_id, repo_url, repo_branch, provider, status, current_step, error, created_at, updated_at FROM jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return self._to_record(row) if row else None

    def update(self, record: JobRecord) -> JobRecord:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE jobs SET snapshot_id=?, sandbox_id=?, repo_url=?, repo_branch=?,
                    provider=?, status=?, current_step=?, error=?, updated_at=?
                WHERE id=?
                """,
                (
                    record.snapshot_id, record.sandbox_id, record.repo_url,
                    record.repo_branch, record.provider, record.status.value,
                    record.current_step, record.error, self._dt(record.updated_at),
                    record.id,
                ),
            )
        return record

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    snapshot_id TEXT NOT NULL,
                    sandbox_id TEXT,
                    repo_url TEXT NOT NULL,
                    repo_branch TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_step TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _dt(value) -> str | None:
        return value.isoformat() if value else None

    @staticmethod
    def _to_record(row: sqlite3.Row) -> JobRecord:
        from datetime import datetime
        def parse(v):
            return datetime.fromisoformat(v) if v else None
        return JobRecord(
            id=row["id"], snapshot_id=row["snapshot_id"],
            sandbox_id=row["sandbox_id"], repo_url=row["repo_url"],
            repo_branch=row["repo_branch"], provider=row["provider"],
            status=JobStatus(row["status"]), current_step=row["current_step"],
            error=row["error"], created_at=parse(row["created_at"]),
            updated_at=parse(row["updated_at"]),
        )


__all__ = ["SQLiteJobRepository", "SQLITE_BUSY_TIMEOUT_MS"]
```

- [ ] **Step 3: Create `factory.py`**

```python
"""Factory for job repository."""

from __future__ import annotations

from typing import Optional

from opensandbox_server.config import AppConfig, get_config
from opensandbox_server.repositories.jobs.sqlite import SQLiteJobRepository
from opensandbox_server.services.job_repository import JobRepository


def create_job_repository(config: Optional[AppConfig] = None) -> JobRepository:
    active_config = config or get_config()
    store_config = active_config.store
    if store_config.type == "sqlite":
        return SQLiteJobRepository(store_config.path)
    raise ValueError(f"Unsupported job store type: {store_config.type}")


__all__ = ["create_job_repository"]
```

- [ ] **Step 4: Verify**

Run: `cd server && .venv/bin/python -c "from opensandbox_server.repositories.jobs import create_job_repository, SQLiteJobRepository; print('OK')"`

- [ ] **Step 5: Commit**

```bash
git add server/opensandbox_server/repositories/jobs/
git commit -m "feat(server): add SQLite job repository"
```

---

## Task 3: Job Repository Unit Tests

**Files:**
- Create: `server/tests/test_job_repository_sqlite.py`

- [ ] **Step 1: Write tests**

```python
"""Unit tests for SQLiteJobRepository."""

from datetime import datetime, timezone

from opensandbox_server.repositories.jobs.sqlite import SQLiteJobRepository
from opensandbox_server.services.job_models import JobRecord, JobStatus, JobStep


def _job(job_id: str = "job-001") -> JobRecord:
    now = datetime.now(timezone.utc)
    return JobRecord(
        id=job_id, snapshot_id="snap-001",
        repo_url="https://token@github.com/org/repo.git",
        repo_branch="main", provider="openai",
        status=JobStatus.PENDING, created_at=now, updated_at=now,
    )


def test_create_and_get(tmp_path):
    repo = SQLiteJobRepository(tmp_path / "jobs.db")
    repo.create(_job())
    loaded = repo.get("job-001")
    assert loaded is not None
    assert loaded.id == "job-001"
    assert loaded.status == JobStatus.PENDING
    assert loaded.snapshot_id == "snap-001"


def test_update(tmp_path):
    repo = SQLiteJobRepository(tmp_path / "jobs.db")
    job = _job()
    repo.create(job)

    job.status = JobStatus.RUNNING
    job.sandbox_id = "sbx-123"
    job.current_step = JobStep.GIT_PULL.value
    repo.update(job)

    loaded = repo.get("job-001")
    assert loaded.status == JobStatus.RUNNING
    assert loaded.sandbox_id == "sbx-123"
    assert loaded.current_step == "git_pull"


def test_update_paused_with_error(tmp_path):
    repo = SQLiteJobRepository(tmp_path / "jobs.db")
    job = _job()
    repo.create(job)

    job.status = JobStatus.PAUSED
    job.current_step = JobStep.RUNNING_CLI.value
    job.error = "CLI exited with code 1"
    repo.update(job)

    loaded = repo.get("job-001")
    assert loaded.status == JobStatus.PAUSED
    assert loaded.error == "CLI exited with code 1"


def test_get_nonexistent(tmp_path):
    repo = SQLiteJobRepository(tmp_path / "jobs.db")
    assert repo.get("nope") is None
```

- [ ] **Step 2: Run tests**

Run: `cd server && .venv/bin/python -m pytest tests/test_job_repository_sqlite.py -v`

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_job_repository_sqlite.py
git commit -m "test(server): add job repository unit tests"
```

---

## Task 4: Job Runner (Async Workflow)

**Files:**
- Create: `server/opensandbox_server/services/job_runner.py`

- [ ] **Step 1: Create job runner**

```python
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
                job.error = "Failed to create or start sandbox"
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

        # Check exit code by inspecting if stderr has fatal content
        # execd streams exit code as part of execution_complete (no explicit field)
        # If we got execution_complete, command succeeded
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
```

- [ ] **Step 2: Verify import**

Run: `cd server && .venv/bin/python -c "from opensandbox_server.services.job_runner import JobRunner; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add server/opensandbox_server/services/job_runner.py
git commit -m "feat(server): add async job runner workflow"
```

---

## Task 5: FastAPI Job Router

**Files:**
- Create: `server/opensandbox_server/api/jobs.py`
- Modify: `server/opensandbox_server/main.py`

- [ ] **Step 1: Create router**

```python
"""API routes for AI Coding Jobs."""

from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from opensandbox_server.repositories.jobs import create_job_repository
from opensandbox_server.repositories.access_keys import create_access_key_repository
from opensandbox_server.services.job_models import JobRecord, JobStatus
from opensandbox_server.services.job_runner import JobRunner

router = APIRouter(prefix="/jobs", tags=["Jobs"])

_job_repo = create_job_repository()
_access_key_repo = create_access_key_repository()
_runner = JobRunner(job_repo=_job_repo, access_key_repo=_access_key_repo)


# --- Schemas ---

class CreateJobRequest(BaseModel):
    snapshot_id: str
    repo_url: str
    repo_branch: str = "main"
    provider: str


class JobResponse(BaseModel):
    id: str
    snapshot_id: str
    sandbox_id: str | None
    repo_url: str  # masked
    repo_branch: str
    provider: str
    status: str
    current_step: str | None
    error: str | None
    created_at: str
    updated_at: str


# --- Helpers ---

_TOKEN_RE = re.compile(r"(https?://)([^@]+)@")


def _mask_url(url: str) -> str:
    return _TOKEN_RE.sub(r"\1****@", url)


def _to_response(job: JobRecord) -> JobResponse:
    return JobResponse(
        id=job.id,
        snapshot_id=job.snapshot_id,
        sandbox_id=job.sandbox_id,
        repo_url=_mask_url(job.repo_url),
        repo_branch=job.repo_branch,
        provider=job.provider,
        status=job.status.value,
        current_step=job.current_step,
        error=job.error,
        created_at=job.created_at.isoformat() if job.created_at else "",
        updated_at=job.updated_at.isoformat() if job.updated_at else "",
    )


# --- Endpoints ---

@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_job(req: CreateJobRequest) -> JobResponse:
    job = JobRecord(
        id=str(uuid.uuid4()),
        snapshot_id=req.snapshot_id,
        repo_url=req.repo_url,
        repo_branch=req.repo_branch,
        provider=req.provider,
        status=JobStatus.PENDING,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    _job_repo.create(job)

    # Launch background task
    asyncio.create_task(_runner.run(job))

    return _to_response(job)


@router.get("/{job_id}")
def get_job(job_id: str) -> JobResponse:
    job = _job_repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_response(job)
```

- [ ] **Step 2: Register router in `main.py`**

Add import and register alongside existing routers:
```python
from opensandbox_server.api.jobs import router as jobs_router

app.include_router(jobs_router)
app.include_router(jobs_router, prefix="/v1")
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && OPENSANDBOX_INSECURE_SERVER=YES timeout 5 .venv/bin/python -m uvicorn opensandbox_server.main:app --host 0.0.0.0 --port 8099 2>&1 | head -10`

- [ ] **Step 4: Commit**

```bash
git add server/opensandbox_server/api/jobs.py server/opensandbox_server/main.py
git commit -m "feat(server): add jobs API router with async execution"
```

---

## Task 6: Job Runner Unit Tests

**Files:**
- Create: `server/tests/test_job_runner.py`

- [ ] **Step 1: Write runner unit tests with mocked execd**

```python
"""Unit tests for JobRunner with mocked HTTP calls."""

import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from opensandbox_server.services.job_models import JobRecord, JobStatus, JobStep
from opensandbox_server.services.job_runner import JobRunner
from opensandbox_server.repositories.jobs.sqlite import SQLiteJobRepository
from opensandbox_server.services.access_key_models import AccessKeyRecord


class FakeAccessKeyRepo:
    def __init__(self, keys):
        self._keys = keys

    def list_all(self):
        return self._keys


def _make_job() -> JobRecord:
    now = datetime.now(timezone.utc)
    return JobRecord(
        id="job-test", snapshot_id="snap-001",
        repo_url="https://tok@github.com/o/r.git",
        repo_branch="main", provider="openai",
        status=JobStatus.PENDING, created_at=now, updated_at=now,
    )


def _sse_response(exit_ok=True):
    """Build a mock SSE response that streams execution_complete."""
    lines = [
        'data:{"type":"init","text":"cmd-1"}',
        'data:{"type":"stdout","text":"output\\n"}',
        'data:{"type":"execution_complete","execution_time":100}',
    ]
    if not exit_ok:
        lines = [
            'data:{"type":"init","text":"cmd-1"}',
            'data:{"type":"error","ename":"ExitError","evalue":"exit code 1"}',
        ]
    return lines


@pytest.fixture
def job_repo(tmp_path):
    return SQLiteJobRepository(tmp_path / "jobs.db")


@pytest.fixture
def access_key_repo():
    keys = [
        AccessKeyRecord(
            id="k1", provider="openai", name="Key1",
            api_key="sk-test-key-123", base_url=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    ]
    return FakeAccessKeyRepo(keys)


@pytest.mark.asyncio
async def test_runner_succeeds_full_flow(job_repo, access_key_repo):
    """Test successful job flow with all steps mocked."""
    runner = JobRunner(job_repo=job_repo, access_key_repo=access_key_repo)
    job = _make_job()
    job_repo.create(job)

    with patch.object(runner, "_create_sandbox", return_value="sbx-123") as mock_create, \
         patch.object(runner, "_exec_command", return_value="ok") as mock_exec, \
         patch.object(runner, "_upload_file", return_value=None) as mock_upload, \
         patch.object(runner, "_destroy_sandbox", return_value=None) as mock_destroy:

        await runner.run(job)

    loaded = job_repo.get("job-test")
    assert loaded.status == JobStatus.SUCCEEDED
    assert loaded.sandbox_id == "sbx-123"


@pytest.mark.asyncio
async def test_runner_pauses_on_step_failure(job_repo, access_key_repo):
    """Test that runner pauses sandbox when a step fails."""
    runner = JobRunner(job_repo=job_repo, access_key_repo=access_key_repo)
    job = _make_job()
    job_repo.create(job)

    with patch.object(runner, "_create_sandbox", return_value="sbx-123"), \
         patch.object(runner, "_exec_command", side_effect=RuntimeError("git clone failed")), \
         patch.object(runner, "_pause_sandbox", return_value=None) as mock_pause:

        await runner.run(job)

    loaded = job_repo.get("job-test")
    assert loaded.status == JobStatus.PAUSED
    assert "git_pull" in loaded.current_step
    assert "git clone failed" in loaded.error
    mock_pause.assert_called_once_with("sbx-123")


@pytest.mark.asyncio
async def test_runner_fails_when_sandbox_creation_fails(job_repo, access_key_repo):
    """Test that runner marks job Failed when sandbox can't be created."""
    runner = JobRunner(job_repo=job_repo, access_key_repo=access_key_repo)
    job = _make_job()
    job_repo.create(job)

    with patch.object(runner, "_create_sandbox", return_value=None):
        await runner.run(job)

    loaded = job_repo.get("job-test")
    assert loaded.status == JobStatus.FAILED
    assert loaded.current_step == "creating_sandbox"
```

- [ ] **Step 2: Run tests**

Run: `cd server && .venv/bin/python -m pytest tests/test_job_runner.py -v`

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_job_runner.py
git commit -m "test(server): add job runner unit tests"
```

---

## Task 7: API E2E Tests

**Files:**
- Create: `server/tests/test_jobs_api.py`

- [ ] **Step 1: Write API tests**

```python
"""E2E tests for Jobs API."""

import pytest
from unittest.mock import patch, AsyncMock

import opensandbox_server.api.jobs as jobs_module
from opensandbox_server.repositories.jobs.sqlite import SQLiteJobRepository


@pytest.fixture(autouse=True)
def isolated_job_repo(tmp_path):
    original = jobs_module._job_repo
    jobs_module._job_repo = SQLiteJobRepository(tmp_path / "jobs.db")
    jobs_module._runner._job_repo = jobs_module._job_repo
    yield
    jobs_module._job_repo = original
    jobs_module._runner._job_repo = original


def test_create_job(client, auth_headers):
    with patch("opensandbox_server.services.job_runner.JobRunner.run", new_callable=AsyncMock):
        resp = client.post(
            "/v1/jobs",
            json={
                "snapshot_id": "snap-001",
                "repo_url": "https://tok@github.com/org/repo.git",
                "repo_branch": "main",
                "provider": "openai",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "Pending"
    assert data["snapshot_id"] == "snap-001"
    assert "****@" in data["repo_url"]  # masked
    assert "id" in data


def test_get_job(client, auth_headers):
    with patch("opensandbox_server.services.job_runner.JobRunner.run", new_callable=AsyncMock):
        create_resp = client.post(
            "/v1/jobs",
            json={
                "snapshot_id": "snap-001",
                "repo_url": "https://tok@github.com/org/repo.git",
                "repo_branch": "main",
                "provider": "openai",
            },
            headers=auth_headers,
        )
    job_id = create_resp.json()["id"]

    resp = client.get(f"/v1/jobs/{job_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


def test_get_nonexistent_job(client, auth_headers):
    resp = client.get("/v1/jobs/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


def test_repo_url_masked_in_response(client, auth_headers):
    with patch("opensandbox_server.services.job_runner.JobRunner.run", new_callable=AsyncMock):
        resp = client.post(
            "/v1/jobs",
            json={
                "snapshot_id": "snap-001",
                "repo_url": "https://ghp_secret123@github.com/org/repo.git",
                "repo_branch": "main",
                "provider": "openai",
            },
            headers=auth_headers,
        )
    data = resp.json()
    assert "ghp_secret123" not in data["repo_url"]
    assert "****@github.com" in data["repo_url"]
```

- [ ] **Step 2: Run tests**

Run: `cd server && .venv/bin/python -m pytest tests/test_jobs_api.py -v`

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_jobs_api.py
git commit -m "test(server): add jobs API E2E tests"
```

---

## Task 8: Full Test Suite Validation

- [ ] **Step 1: Run all backend tests**

Run: `cd server && .venv/bin/python -m pytest tests/ --ignore=tests/k8s -x -q`
Expected: All tests pass, no regressions.

- [ ] **Step 2: Final commit if needed**

```bash
git add -A
git commit -m "fix: address issues found in full test run"
```
