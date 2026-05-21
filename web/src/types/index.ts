export type SandboxState =
  | 'Pending'
  | 'Running'
  | 'Pausing'
  | 'Paused'
  | 'Resuming'
  | 'Stopping'
  | 'Terminated'
  | 'Failed';

export type SnapshotState = 'Creating' | 'Ready' | 'Failed' | 'Deleting';

export interface SandboxStatus {
  state: SandboxState;
  reason?: string | null;
  message?: string | null;
  lastTransitionAt?: string | null;
}

export interface ImageAuth {
  username: string;
  password: string;
}

export interface ImageSpec {
  uri: string;
  auth?: ImageAuth | null;
}

export interface PlatformSpec {
  os: string;
  arch: string;
}

export interface ResourceLimits {
  [key: string]: string;
}

export interface NetworkRule {
  action: string;
  target: string;
}

export interface NetworkPolicy {
  defaultAction?: string | null;
  egress?: NetworkRule[];
}

export interface Host {
  path: string;
}

export interface PVC {
  claimName: string;
  createIfNotExists?: boolean;
  deleteOnSandboxTermination?: boolean;
  storageClass?: string | null;
  storage?: string | null;
  accessModes?: string[] | null;
}

export interface OSSFS {
  bucket: string;
  endpoint: string;
  version?: string;
  options?: string[] | null;
  accessKeyId?: string | null;
  accessKeySecret?: string | null;
}

export interface Volume {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string | null;
  host?: Host | null;
  pvc?: PVC | null;
  ossfs?: OSSFS | null;
}

export interface Sandbox {
  id: string;
  image?: ImageSpec | null;
  snapshotId?: string | null;
  platform?: PlatformSpec | null;
  status: SandboxStatus;
  metadata?: Record<string, string> | null;
  entrypoint?: string[] | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CreateSandboxRequest {
  image?: ImageSpec | null;
  snapshotId?: string | null;
  platform?: PlatformSpec | null;
  timeout?: number | null;
  resourceLimits?: ResourceLimits | null;
  env?: Record<string, string | null> | null;
  metadata?: Record<string, string> | null;
  entrypoint?: string[] | null;
  networkPolicy?: NetworkPolicy | null;
  secureAccess?: boolean;
  volumes?: Volume[] | null;
  extensions?: Record<string, string> | null;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface ListSandboxesResponse {
  items: Sandbox[];
  pagination: PaginationInfo;
}

export interface CreateSandboxResponse {
  id: string;
  status: SandboxStatus;
  metadata?: Record<string, string> | null;
  platform?: PlatformSpec | null;
  expiresAt?: string | null;
  createdAt: string;
  entrypoint?: string[] | null;
}

export interface Endpoint {
  endpoint: string;
  headers?: Record<string, string> | null;
}

export interface RenewSandboxExpirationRequest {
  expiresAt: string;
}

export interface RenewSandboxExpirationResponse {
  expiresAt: string;
}

export interface SnapshotStatus {
  state: SnapshotState;
  reason?: string | null;
  message?: string | null;
  lastTransitionAt?: string | null;
}

export interface Snapshot {
  id: string;
  sandboxId: string;
  name?: string | null;
  status: SnapshotStatus;
  createdAt: string;
}

export interface CreateSnapshotRequest {
  name?: string | null;
}

export interface ListSnapshotsResponse {
  items: Snapshot[];
  pagination: PaginationInfo;
}
