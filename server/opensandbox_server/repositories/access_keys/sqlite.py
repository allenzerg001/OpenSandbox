"""SQLite-backed access key repository."""

from __future__ import annotations

from pathlib import Path
import sqlite3

from opensandbox_server.services.access_key_models import AccessKeyRecord

SQLITE_BUSY_TIMEOUT_MS = 5000


class SQLiteAccessKeyRepository:
    """File-backed repository for access key records."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path).expanduser()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def create(self, record: AccessKeyRecord) -> AccessKeyRecord:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO access_keys (id, provider, name, api_key, base_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.provider,
                    record.name,
                    record.api_key,
                    record.base_url,
                    self._datetime_to_str(record.created_at),
                    self._datetime_to_str(record.updated_at),
                ),
            )
        return record

    def get(self, key_id: str) -> AccessKeyRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, provider, name, api_key, base_url, created_at, updated_at FROM access_keys WHERE id = ?",
                (key_id,),
            ).fetchone()
        return self._row_to_record(row) if row is not None else None

    def list_all(self) -> list[AccessKeyRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, provider, name, api_key, base_url, created_at, updated_at FROM access_keys ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def update(self, record: AccessKeyRecord) -> AccessKeyRecord:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE access_keys
                SET provider = ?, name = ?, api_key = ?, base_url = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    record.provider,
                    record.name,
                    record.api_key,
                    record.base_url,
                    self._datetime_to_str(record.updated_at),
                    record.id,
                ),
            )
        return record

    def delete(self, key_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM access_keys WHERE id = ?", (key_id,))

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS access_keys (
                    id TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    name TEXT NOT NULL UNIQUE,
                    api_key TEXT NOT NULL,
                    base_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_access_keys_provider
                    ON access_keys(provider);

                CREATE INDEX IF NOT EXISTS idx_access_keys_created_at
                    ON access_keys(created_at DESC);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _datetime_to_str(value) -> str | None:
        return value.isoformat() if value is not None else None

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> AccessKeyRecord:
        from datetime import datetime

        def parse_dt(val: str | None):
            return datetime.fromisoformat(val) if val else None

        return AccessKeyRecord(
            id=row["id"],
            provider=row["provider"],
            name=row["name"],
            api_key=row["api_key"],
            base_url=row["base_url"],
            created_at=parse_dt(row["created_at"]),
            updated_at=parse_dt(row["updated_at"]),
        )


__all__ = ["SQLiteAccessKeyRepository", "SQLITE_BUSY_TIMEOUT_MS"]
