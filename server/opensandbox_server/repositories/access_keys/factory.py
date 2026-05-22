"""Factory for selecting the configured access key repository backend."""

from __future__ import annotations

from typing import Optional

from opensandbox_server.config import AppConfig, get_config
from opensandbox_server.repositories.access_keys.sqlite import SQLiteAccessKeyRepository
from opensandbox_server.services.access_key_repository import AccessKeyRepository


def create_access_key_repository(
    config: Optional[AppConfig] = None,
) -> AccessKeyRepository:
    """Create the configured access key repository."""
    active_config = config or get_config()
    store_config = active_config.store

    if store_config.type == "sqlite":
        return SQLiteAccessKeyRepository(store_config.path)

    raise ValueError(f"Unsupported access key store type: {store_config.type}")


__all__ = ["create_access_key_repository"]
