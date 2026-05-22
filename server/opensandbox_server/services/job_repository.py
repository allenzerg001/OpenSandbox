"""Job repository protocol."""

from __future__ import annotations

from typing import Protocol

from opensandbox_server.services.job_models import JobRecord


class JobRepository(Protocol):
    def create(self, record: JobRecord) -> JobRecord: ...
    def get(self, job_id: str) -> JobRecord | None: ...
    def update(self, record: JobRecord) -> JobRecord: ...
