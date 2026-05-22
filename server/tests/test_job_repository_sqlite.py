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
