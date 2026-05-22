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
