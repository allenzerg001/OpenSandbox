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
