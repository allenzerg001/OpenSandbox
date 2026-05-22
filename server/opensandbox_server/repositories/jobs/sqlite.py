"""SQLite-backed job repository."""

from __future__ import annotations

from pathlib import Path
import sqlite3

from opensandbox_server.services.job_models import JobRecord, JobStatus

SQLITE_BUSY_TIMEOUT_MS = 5000


class SQLiteJobRepository:
    """File-backed repository for job records."""

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path).expanduser()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    @property
    def db_path(self) -> Path:
        return self._db_path

    def create(self, record: JobRecord) -> JobRecord:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (id, snapshot_id, sandbox_id, repo_url, repo_branch,
                    provider, status, current_step, error, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id, record.snapshot_id, record.sandbox_id,
                    record.repo_url, record.repo_branch, record.provider,
                    record.status.value, record.current_step, record.error,
                    self._dt(record.created_at), self._dt(record.updated_at),
                ),
            )
        return record

    def get(self, job_id: str) -> JobRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, snapshot_id, sandbox_id, repo_url, repo_branch, provider, status, current_step, error, created_at, updated_at FROM jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return self._to_record(row) if row else None

    def update(self, record: JobRecord) -> JobRecord:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE jobs SET snapshot_id=?, sandbox_id=?, repo_url=?, repo_branch=?,
                    provider=?, status=?, current_step=?, error=?, updated_at=?
                WHERE id=?
                """,
                (
                    record.snapshot_id, record.sandbox_id, record.repo_url,
                    record.repo_branch, record.provider, record.status.value,
                    record.current_step, record.error, self._dt(record.updated_at),
                    record.id,
                ),
            )
        return record

    def _initialize_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    snapshot_id TEXT NOT NULL,
                    sandbox_id TEXT,
                    repo_url TEXT NOT NULL,
                    repo_branch TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_step TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _dt(value) -> str | None:
        return value.isoformat() if value else None

    @staticmethod
    def _to_record(row: sqlite3.Row) -> JobRecord:
        from datetime import datetime
        def parse(v):
            return datetime.fromisoformat(v) if v else None
        return JobRecord(
            id=row["id"], snapshot_id=row["snapshot_id"],
            sandbox_id=row["sandbox_id"], repo_url=row["repo_url"],
            repo_branch=row["repo_branch"], provider=row["provider"],
            status=JobStatus(row["status"]), current_step=row["current_step"],
            error=row["error"], created_at=parse(row["created_at"]),
            updated_at=parse(row["updated_at"]),
        )


__all__ = ["SQLiteJobRepository", "SQLITE_BUSY_TIMEOUT_MS"]
