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
