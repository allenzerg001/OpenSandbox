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
