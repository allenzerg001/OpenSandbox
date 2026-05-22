# Access Keys Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-stack CRUD management for AI provider access keys (used by coding CLIs in sandboxes).

**Architecture:** Backend adds a new `access_keys` SQLite repository following the existing Protocol + Factory pattern (same as snapshots). A new FastAPI router exposes RESTful endpoints. Frontend adds an "Access Keys" page with Ant Design table + drawer form.

**Tech Stack:** Python 3.10+ / FastAPI / SQLite / pytest | React 19 / TypeScript / Ant Design 6 / Vite

---

## File Structure

### Backend (new files)
| File | Responsibility |
|------|---------------|
| `server/opensandbox_server/services/access_key_models.py` | Dataclass model for `AccessKeyRecord` |
| `server/opensandbox_server/services/access_key_repository.py` | Protocol interface for access key repository |
| `server/opensandbox_server/repositories/access_keys/__init__.py` | Package exports |
| `server/opensandbox_server/repositories/access_keys/factory.py` | Factory to create repository |
| `server/opensandbox_server/repositories/access_keys/sqlite.py` | SQLite implementation |
| `server/opensandbox_server/api/access_keys.py` | FastAPI router with CRUD + reveal endpoints |
| `server/tests/test_access_key_repository_sqlite.py` | Unit tests for repository |
| `server/tests/test_access_keys_api.py` | E2E API tests with TestClient |

### Frontend (new/modified files)
| File | Responsibility |
|------|---------------|
| `web/src/types/index.ts` | Add `AccessKey` interface (modify) |
| `web/src/api/index.ts` | Add access key API functions (modify) |
| `web/src/pages/AccessKeys.tsx` | Access Keys list + drawer page (create) |
| `web/src/App.tsx` | Add route (modify) |
| `web/src/components/Layout.tsx` | Add sidebar menu item (modify) |

---

## Task 1: Backend — Access Key Model

**Files:**
- Create: `server/opensandbox_server/services/access_key_models.py`

- [ ] **Step 1: Create the model file**

```python
"""Access key domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(slots=True)
class AccessKeyRecord:
    id: str
    provider: str
    name: str
    api_key: str
    base_url: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2: Verify import works**

Run: `cd server && python -c "from opensandbox_server.services.access_key_models import AccessKeyRecord; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/opensandbox_server/services/access_key_models.py
git commit -m "feat(server): add AccessKeyRecord dataclass model"
```

---

## Task 2: Backend — Repository Protocol

**Files:**
- Create: `server/opensandbox_server/services/access_key_repository.py`

- [ ] **Step 1: Create the repository protocol**

```python
"""Access key repository protocol."""

from __future__ import annotations

from typing import Protocol

from opensandbox_server.services.access_key_models import AccessKeyRecord


class AccessKeyRepository(Protocol):
    def create(self, record: AccessKeyRecord) -> AccessKeyRecord: ...
    def get(self, key_id: str) -> AccessKeyRecord | None: ...
    def list_all(self) -> list[AccessKeyRecord]: ...
    def update(self, record: AccessKeyRecord) -> AccessKeyRecord: ...
    def delete(self, key_id: str) -> None: ...
```

- [ ] **Step 2: Verify import works**

Run: `cd server && python -c "from opensandbox_server.services.access_key_repository import AccessKeyRepository; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/opensandbox_server/services/access_key_repository.py
git commit -m "feat(server): add AccessKeyRepository protocol"
```

---

## Task 3: Backend — SQLite Repository Implementation

**Files:**
- Create: `server/opensandbox_server/repositories/access_keys/__init__.py`
- Create: `server/opensandbox_server/repositories/access_keys/sqlite.py`
- Create: `server/opensandbox_server/repositories/access_keys/factory.py`

- [ ] **Step 1: Create package `__init__.py`**

```python
"""Access keys repository package."""

from opensandbox_server.repositories.access_keys.factory import create_access_key_repository
from opensandbox_server.repositories.access_keys.sqlite import SQLiteAccessKeyRepository

__all__ = [
    "create_access_key_repository",
    "SQLiteAccessKeyRepository",
]
```

- [ ] **Step 2: Create SQLite implementation**

```python
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
```

- [ ] **Step 3: Create factory**

```python
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
```

- [ ] **Step 4: Verify imports work**

Run: `cd server && python -c "from opensandbox_server.repositories.access_keys import create_access_key_repository, SQLiteAccessKeyRepository; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/opensandbox_server/repositories/access_keys/
git commit -m "feat(server): add SQLite access key repository implementation"
```

---

## Task 4: Backend — Unit Tests for Repository

**Files:**
- Create: `server/tests/test_access_key_repository_sqlite.py`

- [ ] **Step 1: Write the test file**

```python
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
        runtime=RuntimeConfig(),
        store=StoreConfig(type="sqlite", path=str(tmp_path / "keys.db")),
    )
    repo = create_access_key_repository(config)
    assert isinstance(repo, SQLiteAccessKeyRepository)
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd server && python -m pytest tests/test_access_key_repository_sqlite.py -v`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_access_key_repository_sqlite.py
git commit -m "test(server): add unit tests for access key SQLite repository"
```

---

## Task 5: Backend — FastAPI Router

**Files:**
- Create: `server/opensandbox_server/api/access_keys.py`
- Modify: `server/opensandbox_server/main.py`

- [ ] **Step 1: Create the access keys router**

```python
"""API routes for Access Key management."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from opensandbox_server.repositories.access_keys import create_access_key_repository
from opensandbox_server.services.access_key_models import AccessKeyRecord

router = APIRouter(prefix="/access-keys", tags=["Access Keys"])

# Initialize repository (same pattern as lifecycle.py)
_repository = create_access_key_repository()


# --- Request/Response Schemas ---


class CreateAccessKeyRequest(BaseModel):
    provider: str
    name: str
    api_key: str
    base_url: str | None = None


class UpdateAccessKeyRequest(BaseModel):
    provider: str | None = None
    name: str | None = None
    api_key: str | None = None
    base_url: str | None = None


class AccessKeyResponse(BaseModel):
    id: str
    provider: str
    name: str
    api_key: str  # masked
    base_url: str | None
    created_at: str
    updated_at: str


# --- Helpers ---


def _mask_key(key: str) -> str:
    """Mask api_key: show only last 4 chars."""
    if len(key) <= 4:
        return "****"
    return "****" + key[-4:]


def _to_response(record: AccessKeyRecord, reveal: bool = False) -> AccessKeyResponse:
    return AccessKeyResponse(
        id=record.id,
        provider=record.provider,
        name=record.name,
        api_key=record.api_key if reveal else _mask_key(record.api_key),
        base_url=record.base_url,
        created_at=record.created_at.isoformat() if record.created_at else "",
        updated_at=record.updated_at.isoformat() if record.updated_at else "",
    )


# --- Endpoints ---


@router.post("", status_code=status.HTTP_201_CREATED)
def create_access_key(req: CreateAccessKeyRequest) -> AccessKeyResponse:
    record = AccessKeyRecord(
        id=str(uuid.uuid4()),
        provider=req.provider,
        name=req.name,
        api_key=req.api_key,
        base_url=req.base_url,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    _repository.create(record)
    return _to_response(record)


@router.get("")
def list_access_keys() -> list[AccessKeyResponse]:
    records = _repository.list_all()
    return [_to_response(r) for r in records]


@router.get("/{key_id}")
def get_access_key(key_id: str) -> AccessKeyResponse:
    record = _repository.get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Access key not found")
    return _to_response(record)


@router.put("/{key_id}")
def update_access_key(key_id: str, req: UpdateAccessKeyRequest) -> AccessKeyResponse:
    record = _repository.get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Access key not found")

    if req.provider is not None:
        record.provider = req.provider
    if req.name is not None:
        record.name = req.name
    if req.api_key is not None:
        record.api_key = req.api_key
    if req.base_url is not None:
        record.base_url = req.base_url
    record.updated_at = datetime.now(timezone.utc)

    _repository.update(record)
    return _to_response(record)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_access_key(key_id: str) -> None:
    record = _repository.get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Access key not found")
    _repository.delete(key_id)


@router.get("/{key_id}/reveal")
def reveal_access_key(key_id: str) -> AccessKeyResponse:
    record = _repository.get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Access key not found")
    return _to_response(record, reveal=True)
```

- [ ] **Step 2: Register router in `main.py`**

In `server/opensandbox_server/main.py`, add the import and register the router alongside existing routers. Find where `app.include_router(...)` calls are grouped and add:

```python
from opensandbox_server.api.access_keys import router as access_keys_router

# Add alongside existing router registrations:
app.include_router(access_keys_router)
app.include_router(access_keys_router, prefix="/v1")
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && timeout 5 python -m uvicorn opensandbox_server.main:app --host 0.0.0.0 --port 8099 2>&1 | head -5`
Expected: Server starts without import errors (may timeout, that's OK)

- [ ] **Step 4: Commit**

```bash
git add server/opensandbox_server/api/access_keys.py server/opensandbox_server/main.py
git commit -m "feat(server): add access keys CRUD API router"
```

---

## Task 6: Backend — E2E API Tests

**Files:**
- Create: `server/tests/test_access_keys_api.py`

- [ ] **Step 1: Write E2E API tests**

```python
"""E2E tests for Access Keys API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api_client():
    """Create a TestClient with a fresh in-memory-like DB for access keys."""
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        os.environ["SANDBOX_CONFIG_PATH"] = os.path.join(
            os.path.dirname(__file__), "testdata", "config.toml"
        )
        # Patch the repository to use temp DB
        from opensandbox_server.repositories.access_keys.sqlite import SQLiteAccessKeyRepository
        import opensandbox_server.api.access_keys as access_keys_module

        original_repo = access_keys_module._repository
        access_keys_module._repository = SQLiteAccessKeyRepository(db_path)

        from opensandbox_server.main import app

        client = TestClient(app)
        yield client

        # Restore
        access_keys_module._repository = original_repo


@pytest.fixture
def auth_headers():
    return {"OPEN-SANDBOX-API-KEY": "test-api-key-12345"}


def test_create_access_key(api_client, auth_headers):
    resp = api_client.post(
        "/v1/access-keys",
        json={
            "provider": "openai",
            "name": "Test Key",
            "api_key": "sk-1234567890abcdef",
            "base_url": None,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["provider"] == "openai"
    assert data["name"] == "Test Key"
    assert data["api_key"] == "****cdef"  # masked
    assert "id" in data


def test_list_access_keys(api_client, auth_headers):
    # Create two keys
    api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Key 1", "api_key": "sk-aaaa1111"},
        headers=auth_headers,
    )
    api_client.post(
        "/v1/access-keys",
        json={"provider": "anthropic", "name": "Key 2", "api_key": "sk-bbbb2222"},
        headers=auth_headers,
    )

    resp = api_client.get("/v1/access-keys", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    # All keys masked
    for item in data:
        assert item["api_key"].startswith("****")


def test_get_access_key(api_client, auth_headers):
    create_resp = api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Get Test", "api_key": "sk-gettest1234"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = api_client.get(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["api_key"] == "****1234"


def test_get_nonexistent_returns_404(api_client, auth_headers):
    resp = api_client.get("/v1/access-keys/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


def test_reveal_access_key(api_client, auth_headers):
    create_resp = api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Reveal Test", "api_key": "sk-reveal-secret-key"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = api_client.get(f"/v1/access-keys/{key_id}/reveal", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["api_key"] == "sk-reveal-secret-key"


def test_update_access_key(api_client, auth_headers):
    create_resp = api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Update Test", "api_key": "sk-old-key"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = api_client.put(
        f"/v1/access-keys/{key_id}",
        json={"name": "Updated Name", "api_key": "sk-new-key-value"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert resp.json()["api_key"] == "****alue"

    # Verify via reveal
    reveal_resp = api_client.get(f"/v1/access-keys/{key_id}/reveal", headers=auth_headers)
    assert reveal_resp.json()["api_key"] == "sk-new-key-value"


def test_delete_access_key(api_client, auth_headers):
    create_resp = api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Delete Test", "api_key": "sk-delete-me"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = api_client.delete(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Verify deleted
    get_resp = api_client.get(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_mask_short_key(api_client, auth_headers):
    """Keys with 4 or fewer chars should be fully masked."""
    create_resp = api_client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Short Key", "api_key": "ab"},
        headers=auth_headers,
    )
    assert create_resp.json()["api_key"] == "****"
```

- [ ] **Step 2: Run E2E tests**

Run: `cd server && python -m pytest tests/test_access_keys_api.py -v`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add server/tests/test_access_keys_api.py
git commit -m "test(server): add E2E tests for access keys API"
```

---

## Task 7: Frontend — Type Definitions

**Files:**
- Modify: `web/src/types/index.ts`

- [ ] **Step 1: Add AccessKey types to the end of the types file**

Append to `web/src/types/index.ts`:

```typescript
// Access Keys
export interface AccessKey {
  id: string;
  provider: string;
  name: string;
  api_key: string;
  base_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAccessKeyRequest {
  provider: string;
  name: string;
  api_key: string;
  base_url?: string | null;
}

export interface UpdateAccessKeyRequest {
  provider?: string;
  name?: string;
  api_key?: string;
  base_url?: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/types/index.ts
git commit -m "feat(web): add AccessKey type definitions"
```

---

## Task 8: Frontend — API Functions

**Files:**
- Modify: `web/src/api/index.ts`

- [ ] **Step 1: Add access key API functions to the end of the file**

Append to `web/src/api/index.ts`:

```typescript
// Access Keys
export async function listAccessKeys(): Promise<AccessKey[]> {
  const { data } = await client.get('/access-keys');
  return data;
}

export async function getAccessKey(id: string): Promise<AccessKey> {
  const { data } = await client.get(`/access-keys/${id}`);
  return data;
}

export async function createAccessKey(req: CreateAccessKeyRequest): Promise<AccessKey> {
  const { data } = await client.post('/access-keys', req);
  return data;
}

export async function updateAccessKey(id: string, req: UpdateAccessKeyRequest): Promise<AccessKey> {
  const { data } = await client.put(`/access-keys/${id}`, req);
  return data;
}

export async function deleteAccessKey(id: string): Promise<void> {
  await client.delete(`/access-keys/${id}`);
}

export async function revealAccessKey(id: string): Promise<AccessKey> {
  const { data } = await client.get(`/access-keys/${id}/reveal`);
  return data;
}
```

Also add the imports at the top of the file:

```typescript
import type {
  // ... existing imports ...
  AccessKey,
  CreateAccessKeyRequest,
  UpdateAccessKeyRequest,
} from '../types';
```

- [ ] **Step 2: Commit**

```bash
git add web/src/api/index.ts
git commit -m "feat(web): add access key API functions"
```

---

## Task 9: Frontend — Access Keys Page

**Files:**
- Create: `web/src/pages/AccessKeys.tsx`

- [ ] **Step 1: Create the Access Keys page component**

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Drawer,
  Form,
  Input,
  Select,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import {
  listAccessKeys,
  createAccessKey,
  updateAccessKey,
  deleteAccessKey,
  revealAccessKey,
} from '../api';
import type { AccessKey, CreateAccessKeyRequest, UpdateAccessKeyRequest } from '../types';

const PRESET_PROVIDERS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Qoder', value: 'qoder' },
  { label: 'Custom', value: '__custom__' },
];

const providerColors: Record<string, string> = {
  openai: 'green',
  anthropic: 'orange',
  google: 'blue',
  deepseek: 'purple',
  qoder: 'cyan',
};

const AccessKeys: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<AccessKey | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [form] = Form.useForm();
  const [providerSelect, setProviderSelect] = useState<string>('openai');

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAccessKeys();
      setKeys(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch access keys';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleReveal = async (id: string) => {
    if (revealedKeys[id]) {
      // Toggle hide
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const data = await revealAccessKey(id);
      setRevealedKeys((prev) => ({ ...prev, [id]: data.api_key }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reveal key';
      messageApi.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAccessKey(id);
      messageApi.success('Access key deleted');
      fetchKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete key';
      messageApi.error(msg);
    }
  };

  const openCreateDrawer = () => {
    setEditingKey(null);
    setProviderSelect('openai');
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: AccessKey) => {
    setEditingKey(record);
    const isPreset = PRESET_PROVIDERS.some((p) => p.value === record.provider);
    setProviderSelect(isPreset ? record.provider : '__custom__');
    form.setFieldsValue({
      provider: isPreset ? record.provider : '__custom__',
      custom_provider: isPreset ? '' : record.provider,
      name: record.name,
      api_key: '',
      base_url: record.base_url || '',
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const provider =
        values.provider === '__custom__' ? values.custom_provider : values.provider;

      if (editingKey) {
        const req: UpdateAccessKeyRequest = {
          provider,
          name: values.name,
          base_url: values.base_url || null,
        };
        if (values.api_key) {
          req.api_key = values.api_key;
        }
        await updateAccessKey(editingKey.id, req);
        messageApi.success('Access key updated');
      } else {
        const req: CreateAccessKeyRequest = {
          provider,
          name: values.name,
          api_key: values.api_key,
          base_url: values.base_url || null,
        };
        await createAccessKey(req);
        messageApi.success('Access key created');
      }
      setDrawerOpen(false);
      fetchKeys();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // form validation
      const msg = err instanceof Error ? err.message : 'Operation failed';
      messageApi.error(msg);
    }
  };

  const columns: ColumnsType<AccessKey> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 120,
      render: (provider: string) => (
        <Tag color={providerColors[provider] || 'default'}>{provider}</Tag>
      ),
    },
    {
      title: 'API Key',
      key: 'api_key',
      width: 220,
      render: (_: unknown, record: AccessKey) => (
        <Space size="small">
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {revealedKeys[record.id] || record.api_key}
          </span>
          <Button
            type="text"
            size="small"
            icon={revealedKeys[record.id] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => handleReveal(record.id)}
          />
        </Space>
      ),
    },
    {
      title: 'Base URL',
      dataIndex: 'base_url',
      key: 'base_url',
      width: 200,
      render: (val: string | null) => val || '-',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_: unknown, record: AccessKey) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditDrawer(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete access key"
            description="Are you sure you want to delete this key?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Access Keys</Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchKeys}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            Add Key
          </Button>
        </Space>
      </div>

      <Table<AccessKey>
        rowKey="id"
        columns={columns}
        dataSource={keys}
        loading={loading}
        scroll={{ x: 1030 }}
        pagination={false}
      />

      <Drawer
        title={editingKey ? 'Edit Access Key' : 'Add Access Key'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={
          <Button type="primary" onClick={handleSubmit}>
            {editingKey ? 'Update' : 'Create'}
          </Button>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ provider: 'openai' }}>
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: 'Please select a provider' }]}
          >
            <Select
              options={PRESET_PROVIDERS}
              onChange={(val) => setProviderSelect(val)}
            />
          </Form.Item>

          {providerSelect === '__custom__' && (
            <Form.Item
              name="custom_provider"
              label="Custom Provider Name"
              rules={[{ required: true, message: 'Please enter provider name' }]}
            >
              <Input placeholder="e.g. my-llm-service" />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="e.g. My OpenAI Key" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label="API Key"
            rules={editingKey ? [] : [{ required: true, message: 'Please enter the API key' }]}
          >
            <Input.Password
              placeholder={editingKey ? 'Leave empty to keep unchanged' : 'Enter API key'}
              prefix={<KeyOutlined />}
            />
          </Form.Item>

          <Form.Item name="base_url" label="Base URL (optional)">
            <Input placeholder="e.g. https://api.openai.com/v1" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AccessKeys;
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/AccessKeys.tsx
git commit -m "feat(web): add Access Keys page component"
```

---

## Task 10: Frontend — Routing & Sidebar

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Layout.tsx`

- [ ] **Step 1: Add route to `App.tsx`**

Add import at the top:
```typescript
import AccessKeys from './pages/AccessKeys';
```

Add route inside the `<Route path="/" element={<Layout />}>` block, after the snapshots routes:
```tsx
<Route path="access-keys" element={<AccessKeys />} />
```

- [ ] **Step 2: Add sidebar menu item to `Layout.tsx`**

Add import:
```typescript
import { CloudServerOutlined, CameraOutlined, KeyOutlined } from '@ant-design/icons';
```

Add to `menuItems` array:
```typescript
{ key: '/access-keys', icon: <KeyOutlined />, label: 'Access Keys' },
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat(web): add Access Keys route and sidebar menu item"
```

---

## Task 11: Frontend — E2E Verification

- [ ] **Step 1: Start the dev server and verify visually**

Run: `cd web && npm run dev`

Manual verification checklist:
1. Navigate to `http://localhost:5173/access-keys`
2. Verify "Access Keys" appears in sidebar with key icon
3. Verify empty table renders with correct columns
4. Click "Add Key" → drawer opens with form
5. Fill form (provider=openai, name=Test, api_key=sk-test123) → submit
6. Verify new row appears with masked key `****t123`
7. Click eye icon → reveals full key
8. Click edit → drawer opens with pre-filled values
9. Click delete → popconfirm → row removed

- [ ] **Step 2: Run full backend test suite to ensure no regressions**

Run: `cd server && python -m pytest tests/ -v --ignore=tests/k8s -x`
Expected: All tests pass, no regressions

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during E2E verification"
```
