"""Unit tests for SQLiteAccessKeyRepository."""

from datetime import datetime, timezone

from opensandbox_server.repositories.access_keys.sqlite import (
    SQLITE_BUSY_TIMEOUT_MS,
    SQLiteAccessKeyRepository,
)
from opensandbox_server.repositories.access_keys.factory import create_access_key_repository
from opensandbox_server.config import AppConfig, RuntimeConfig, StoreConfig
from opensandbox_server.services.access_key_models import AccessKeyRecord


def _record(key_id: str = "key-001", provider: str = "openai", name: str = "My Key") -> AccessKeyRecord:
    now = datetime.now(timezone.utc)
    return AccessKeyRecord(
        id=key_id,
        provider=provider,
        name=name,
        api_key="sk-test-1234567890abcdef",
        base_url=None,
        created_at=now,
        updated_at=now,
    )


def test_create_and_get(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    record = _record()

    repo.create(record)
    loaded = repo.get("key-001")

    assert loaded is not None
    assert loaded.id == "key-001"
    assert loaded.provider == "openai"
    assert loaded.name == "My Key"
    assert loaded.api_key == "sk-test-1234567890abcdef"
    assert loaded.base_url is None


def test_list_all(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    repo.create(_record("key-001", "openai", "Key 1"))
    repo.create(_record("key-002", "anthropic", "Key 2"))
    repo.create(_record("key-003", "openai", "Key 3"))

    items = repo.list_all()
    assert len(items) == 3
    # Ordered by created_at DESC
    assert items[0].id == "key-003"


def test_update(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    record = _record()
    repo.create(record)

    record.name = "Updated Name"
    record.api_key = "sk-new-key-value"
    record.base_url = "https://custom.openai.com"
    repo.update(record)

    loaded = repo.get("key-001")
    assert loaded is not None
    assert loaded.name == "Updated Name"
    assert loaded.api_key == "sk-new-key-value"
    assert loaded.base_url == "https://custom.openai.com"


def test_delete(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    repo.create(_record())

    repo.delete("key-001")
    assert repo.get("key-001") is None


def test_get_nonexistent_returns_none(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    assert repo.get("nonexistent") is None


def test_unique_name_constraint(tmp_path) -> None:
    import sqlite3

    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    repo.create(_record("key-001", "openai", "Same Name"))

    try:
        repo.create(_record("key-002", "anthropic", "Same Name"))
        assert False, "Should have raised IntegrityError"
    except sqlite3.IntegrityError:
        pass


def test_wal_and_busy_timeout(tmp_path) -> None:
    repo = SQLiteAccessKeyRepository(tmp_path / "keys.db")

    with repo._connect() as conn:
        journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]

    assert journal_mode.lower() == "wal"
    assert busy_timeout == SQLITE_BUSY_TIMEOUT_MS


def test_factory_creates_sqlite_repository(tmp_path) -> None:
    config = AppConfig(
        runtime=RuntimeConfig(type="docker", execd_image="ghcr.io/opensandbox/execd:latest"),
        store=StoreConfig(type="sqlite", path=str(tmp_path / "keys.db")),
    )
    repo = create_access_key_repository(config)
    assert isinstance(repo, SQLiteAccessKeyRepository)
