import client from './client';
import type {
  Sandbox,
  ListSandboxesResponse,
  CreateSandboxRequest,
  CreateSandboxResponse,
  Endpoint,
  RenewSandboxExpirationRequest,
  RenewSandboxExpirationResponse,
  Snapshot,
  ListSnapshotsResponse,
  CreateSnapshotRequest,
  AccessKey,
  CreateAccessKeyRequest,
  UpdateAccessKeyRequest,
} from '../types';

// Sandboxes
export async function listSandboxes(params: {
  state?: string[];
  metadata?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListSandboxesResponse> {
  const { data } = await client.get('/sandboxes', { params });
  return data;
}

export async function getSandbox(id: string): Promise<Sandbox> {
  const { data } = await client.get(`/sandboxes/${id}`);
  return data;
}

export async function createSandbox(req: CreateSandboxRequest): Promise<CreateSandboxResponse> {
  const { data } = await client.post('/sandboxes', req);
  return data;
}

export async function deleteSandbox(id: string): Promise<void> {
  await client.delete(`/sandboxes/${id}`);
}

export async function pauseSandbox(id: string): Promise<void> {
  await client.post(`/sandboxes/${id}/pause`);
}

export async function resumeSandbox(id: string): Promise<void> {
  await client.post(`/sandboxes/${id}/resume`);
}

export async function renewExpiration(
  id: string,
  req: RenewSandboxExpirationRequest
): Promise<RenewSandboxExpirationResponse> {
  const { data } = await client.post(`/sandboxes/${id}/renew-expiration`, req);
  return data;
}

export async function patchMetadata(
  id: string,
  patch: Record<string, string | null>
): Promise<Sandbox> {
  const { data } = await client.patch(`/sandboxes/${id}/metadata`, patch);
  return data;
}

export async function getEndpoint(
  id: string,
  port: number,
  params?: { use_server_proxy?: boolean; expires?: number }
): Promise<Endpoint> {
  const { data } = await client.get(`/sandboxes/${id}/endpoints/${port}`, { params });
  return data;
}

export async function getSandboxLogs(
  id: string,
  params?: { scope?: string; tail?: number; since?: string }
): Promise<string> {
  const { data } = await client.get(`/sandboxes/${id}/diagnostics/logs`, { params });
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

// Snapshots
export async function listSnapshots(params: {
  sandboxId?: string;
  state?: string[];
  page?: number;
  pageSize?: number;
}): Promise<ListSnapshotsResponse> {
  const { data } = await client.get('/snapshots', { params });
  return data;
}

export async function getSnapshot(id: string): Promise<Snapshot> {
  const { data } = await client.get(`/snapshots/${id}`);
  return data;
}

export async function createSnapshot(sandboxId: string, req?: CreateSnapshotRequest): Promise<Snapshot> {
  const { data } = await client.post(`/sandboxes/${sandboxId}/snapshots`, req || {});
  return data;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await client.delete(`/snapshots/${id}`);
}

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
