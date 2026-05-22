"""Unit tests for JobRunner with mocked HTTP calls."""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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

    with patch.object(runner, "_create_sandbox", return_value="sbx-123"), \
         patch.object(runner, "_exec_command", return_value="ok"), \
         patch.object(runner, "_upload_file", return_value=None), \
         patch.object(runner, "_destroy_sandbox", return_value=None):

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
