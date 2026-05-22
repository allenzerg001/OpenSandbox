# Copyright 2025 Alibaba Group Holding Ltd.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""E2E tests for Access Keys API endpoints."""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient

import opensandbox_server.api.access_keys as access_keys_module
from opensandbox_server.repositories.access_keys.sqlite import SQLiteAccessKeyRepository


@pytest.fixture(autouse=True)
def isolated_repository(tmp_path):
    """Replace the module-level repository with a fresh temp DB for each test."""
    original = access_keys_module._repository
    access_keys_module._repository = SQLiteAccessKeyRepository(tmp_path / "keys.db")
    yield
    access_keys_module._repository = original


def test_create_access_key(client, auth_headers):
    resp = client.post(
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
    assert data["api_key"] == "****cdef"
    assert "id" in data


def test_list_access_keys(client, auth_headers):
    client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Key 1", "api_key": "sk-aaaa1111"},
        headers=auth_headers,
    )
    client.post(
        "/v1/access-keys",
        json={"provider": "anthropic", "name": "Key 2", "api_key": "sk-bbbb2222"},
        headers=auth_headers,
    )

    resp = client.get("/v1/access-keys", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    for item in data:
        assert item["api_key"].startswith("****")


def test_get_access_key(client, auth_headers):
    create_resp = client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Get Test", "api_key": "sk-gettest1234"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = client.get(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["api_key"] == "****1234"


def test_get_nonexistent_returns_404(client, auth_headers):
    resp = client.get("/v1/access-keys/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


def test_reveal_access_key(client, auth_headers):
    create_resp = client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Reveal Test", "api_key": "sk-reveal-secret-key"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = client.get(f"/v1/access-keys/{key_id}/reveal", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["api_key"] == "sk-reveal-secret-key"


def test_update_access_key(client, auth_headers):
    create_resp = client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Update Test", "api_key": "sk-old-key"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = client.put(
        f"/v1/access-keys/{key_id}",
        json={"name": "Updated Name", "api_key": "sk-new-key-value"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert resp.json()["api_key"] == "****alue"

    reveal_resp = client.get(f"/v1/access-keys/{key_id}/reveal", headers=auth_headers)
    assert reveal_resp.json()["api_key"] == "sk-new-key-value"


def test_delete_access_key(client, auth_headers):
    create_resp = client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Delete Test", "api_key": "sk-delete-me"},
        headers=auth_headers,
    )
    key_id = create_resp.json()["id"]

    resp = client.delete(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert resp.status_code == 204

    get_resp = client.get(f"/v1/access-keys/{key_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_mask_short_key(client, auth_headers):
    """Keys with 4 or fewer chars should be fully masked."""
    create_resp = client.post(
        "/v1/access-keys",
        json={"provider": "openai", "name": "Short Key", "api_key": "ab"},
        headers=auth_headers,
    )
    assert create_resp.json()["api_key"] == "****"
