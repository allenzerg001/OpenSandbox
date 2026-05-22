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
