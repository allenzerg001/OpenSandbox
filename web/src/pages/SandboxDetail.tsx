import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Tabs,
  Descriptions,
  Tag,
  Button,
  Space,
  Spin,
  Input,
  InputNumber,
  Switch,
  Form,
  Table,
  Modal,
  message,
  Popconfirm,
  Typography,
  Card,
  DatePicker,
  Alert,
} from 'antd';
import {
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  CopyOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import type { Sandbox, SandboxState, SnapshotState, Snapshot, Endpoint } from '../types';
import type { Dayjs } from 'dayjs';
import {
  getSandbox,
  deleteSandbox,
  pauseSandbox,
  resumeSandbox,
  renewExpiration,
  patchMetadata,
  getEndpoint,
  getSandboxLogs,
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
} from '../api';

const { Text } = Typography;

// --- Helpers ---

const TRANSITIONAL_STATES: SandboxState[] = ['Pending', 'Pausing', 'Resuming', 'Stopping'];

function stateColor(state: SandboxState): string {
  switch (state) {
    case 'Running':
      return 'green';
    case 'Paused':
      return 'blue';
    case 'Pending':
    case 'Pausing':
    case 'Resuming':
    case 'Stopping':
      return 'orange';
    case 'Terminated':
      return 'default';
    case 'Failed':
      return 'red';
    default:
      return 'default';
  }
}

function snapshotStateColor(state: SnapshotState | string): string {
  switch (state) {
    case 'Creating':
      return 'gold';
    case 'Ready':
      return 'green';
    case 'Failed':
      return 'red';
    case 'Deleting':
      return 'orange';
    default:
      return 'default';
  }
}

// --- Component ---

export default function SandboxDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewDate, setRenewDate] = useState<Dayjs | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Data fetching ---

  const fetchSandbox = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getSandbox(id);
      setSandbox(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch sandbox';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSandbox();
  }, [fetchSandbox]);

  // Poll when in transitional state
  useEffect(() => {
    if (sandbox && TRANSITIONAL_STATES.includes(sandbox.status.state)) {
      pollRef.current = setInterval(fetchSandbox, 2000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [sandbox?.status.state, fetchSandbox]);

  // --- Actions ---

  const handlePause = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await pauseSandbox(id);
      message.success('Pause requested');
      await fetchSandbox();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to pause';
      message.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await resumeSandbox(id);
      message.success('Resume requested');
      await fetchSandbox();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resume';
      message.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await deleteSandbox(id);
      message.success('Sandbox deleted');
      navigate('/sandboxes');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      message.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!id || !renewDate) return;
    setActionLoading(true);
    try {
      const resp = await renewExpiration(id, {
        expiresAt: renewDate.toISOString(),
      });
      message.success(`Expiration renewed to ${resp.expiresAt}`);
      setRenewModalOpen(false);
      setRenewDate(null);
      await fetchSandbox();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to renew';
      message.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!sandbox) {
    return (
      <Card style={{ margin: 24 }}>
        <Text type="danger">Sandbox not found</Text>
      </Card>
    );
  }

  const state = sandbox.status.state;
  const canPause = state === 'Running';
  const canResume = state === 'Paused';
  const canRenew = state === 'Running' || state === 'Paused';
  const canDelete = !TRANSITIONAL_STATES.includes(state);

  return (
    <div style={{ padding: 24 }}>
      {/* Top bar */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="middle" align="center" wrap>
          <Tag color={stateColor(state)}>{state}</Tag>
          <Text strong copyable>
            {sandbox.id}
          </Text>
          <Button
            icon={<PauseCircleOutlined />}
            disabled={!canPause}
            loading={actionLoading}
            onClick={handlePause}
          >
            Pause
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            disabled={!canResume}
            loading={actionLoading}
            onClick={handleResume}
          >
            Resume
          </Button>
          <Button
            icon={<FieldTimeOutlined />}
            disabled={!canRenew}
            onClick={() => setRenewModalOpen(true)}
          >
            Renew
          </Button>
          <Popconfirm
            title="Delete this sandbox?"
            description="This action cannot be undone."
            onConfirm={handleDelete}
            okText="Delete"
            okType="danger"
          >
            <Button icon={<DeleteOutlined />} danger disabled={!canDelete} loading={actionLoading}>
              Delete
            </Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={fetchSandbox}>
            Refresh
          </Button>
        </Space>
      </Card>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: <OverviewTab sandbox={sandbox} />,
          },
          {
            key: 'metadata',
            label: 'Metadata',
            children: <MetadataTab sandbox={sandbox} onUpdated={fetchSandbox} />,
          },
          {
            key: 'endpoints',
            label: 'Endpoints',
            children: <EndpointsTab sandboxId={sandbox.id} />,
          },
          {
            key: 'logs',
            label: 'Logs',
            children: <LogsTab sandboxId={sandbox.id} />,
          },
          {
            key: 'snapshots',
            label: 'Snapshots',
            children: <SnapshotsTab sandbox={sandbox} />,
          },
        ]}
      />

      {/* Renew Expiration Modal */}
      <Modal
        title="Renew Expiration"
        open={renewModalOpen}
        onCancel={() => {
          setRenewModalOpen(false);
          setRenewDate(null);
        }}
        onOk={handleRenew}
        confirmLoading={actionLoading}
        okButtonProps={{
          disabled:
            !renewDate ||
            (sandbox.expiresAt ? renewDate.isBefore(dayjs(sandbox.expiresAt)) : false),
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            Current expiration:{' '}
            {sandbox.expiresAt ? dayjs(sandbox.expiresAt).format('YYYY-MM-DD HH:mm:ss') : 'None'}
          </Text>
          <DatePicker
            showTime
            style={{ width: '100%' }}
            value={renewDate}
            onChange={(val) => setRenewDate(val)}
            disabledDate={(current) => {
              if (!sandbox.expiresAt) return current.isBefore(dayjs());
              return current.isBefore(dayjs(sandbox.expiresAt));
            }}
          />
          {renewDate && sandbox.expiresAt && renewDate.isBefore(dayjs(sandbox.expiresAt)) && (
            <Text type="danger">New expiration must be after current expiration.</Text>
          )}
        </Space>
      </Modal>
    </div>
  );
}

// =============================================================================
// Tab 1: Overview
// =============================================================================

function OverviewTab({ sandbox }: { sandbox: Sandbox }) {
  return (
    <Descriptions bordered column={1} size="small">
      <Descriptions.Item label="ID">
        <Text copyable>{sandbox.id}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="State">
        <Tag color={stateColor(sandbox.status.state)}>{sandbox.status.state}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Message">
        {sandbox.status.message ? (
          <Text>{sandbox.status.message}</Text>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Reason">
        {sandbox.status.reason ? (
          <Text>{sandbox.status.reason}</Text>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Image">
        {sandbox.image?.uri ? (
          <Text code>{sandbox.image.uri}</Text>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Platform">
        {sandbox.platform ? (
          <Text>
            {sandbox.platform.os}/{sandbox.platform.arch}
          </Text>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Entrypoint">
        {sandbox.entrypoint && sandbox.entrypoint.length > 0 ? (
          <Space wrap>
            {sandbox.entrypoint.map((arg, i) => (
              <Tag key={i}>{arg}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Metadata">
        {sandbox.metadata && Object.keys(sandbox.metadata).length > 0 ? (
          <Space direction="vertical" size={2}>
            {Object.entries(sandbox.metadata).map(([k, v]) => (
              <Text key={k} code>
                {k}={v}
              </Text>
            ))}
          </Space>
        ) : (
          <Text type="secondary">--</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Expires At">
        {sandbox.expiresAt ? dayjs(sandbox.expiresAt).format('YYYY-MM-DD HH:mm:ss') : '--'}
      </Descriptions.Item>
      <Descriptions.Item label="Created At">
        {dayjs(sandbox.createdAt).format('YYYY-MM-DD HH:mm:ss')}
      </Descriptions.Item>
      <Descriptions.Item label="Last Transition At">
        {sandbox.status.lastTransitionAt
          ? dayjs(sandbox.status.lastTransitionAt).format('YYYY-MM-DD HH:mm:ss')
          : '--'}
      </Descriptions.Item>
    </Descriptions>
  );
}

// =============================================================================
// Tab 2: Metadata Edit
// =============================================================================

function MetadataTab({ sandbox, onUpdated }: { sandbox: Sandbox; onUpdated: () => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const initialEntries = Object.entries(sandbox.metadata || {}).map(([key, value]) => ({
    key,
    value,
  }));

  const handleSave = async () => {
    const values = form.getFieldsValue();
    const entries: { key: string; value: string }[] = values.entries || [];

    // Build patch: new/changed values as strings, removed keys as null
    const patch: Record<string, string | null> = {};
    const currentKeys = new Set<string>();

    for (const entry of entries) {
      if (entry.key) {
        currentKeys.add(entry.key);
        const original = sandbox.metadata?.[entry.key];
        if (original !== entry.value) {
          patch[entry.key] = entry.value;
        }
      }
    }

    // Keys that were removed
    if (sandbox.metadata) {
      for (const oldKey of Object.keys(sandbox.metadata)) {
        if (!currentKeys.has(oldKey)) {
          patch[oldKey] = null;
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      message.info('No changes to save');
      return;
    }

    setSaving(true);
    try {
      await patchMetadata(sandbox.id, patch);
      message.success('Metadata updated');
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update metadata';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Alert
        type="warning"
        message="There is no optimistic locking. Concurrent edits may overwrite each other."
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Form form={form} initialValues={{ entries: initialEntries }} autoComplete="off">
        <Form.List name="entries">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    {...restField}
                    name={[name, 'key']}
                    rules={[{ required: true, message: 'Key required' }]}
                  >
                    <Input placeholder="Key" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'value']}
                    rules={[{ required: true, message: 'Value required' }]}
                  >
                    <Input placeholder="Value" style={{ width: 300 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(name)} />
                </Space>
              ))}
              <Form.Item>
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Add Entry
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
        <Form.Item>
          <Button type="primary" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

// =============================================================================
// Tab 3: Endpoints
// =============================================================================

function EndpointsTab({ sandboxId }: { sandboxId: string }) {
  const [port, setPort] = useState<number | null>(null);
  const [useServerProxy, setUseServerProxy] = useState(false);
  const [expires, setExpires] = useState<number | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [querying, setQuerying] = useState(false);

  const handleQuery = async () => {
    if (!port) {
      message.warning('Please enter a port number');
      return;
    }
    setQuerying(true);
    setEndpoint(null);
    try {
      const params: { use_server_proxy?: boolean; expires?: number } = {};
      if (useServerProxy) params.use_server_proxy = true;
      if (expires) params.expires = expires;
      const data = await getEndpoint(sandboxId, port, params);
      setEndpoint(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get endpoint';
      message.error(msg);
    } finally {
      setQuerying(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <InputNumber
            min={1}
            max={65535}
            placeholder="Port (1-65535)"
            value={port}
            onChange={(v) => setPort(v)}
            style={{ width: 160 }}
          />
          <Space>
            <Text>Use Server Proxy:</Text>
            <Switch checked={useServerProxy} onChange={setUseServerProxy} />
          </Space>
          <InputNumber
            placeholder="Expires (unix timestamp)"
            value={expires}
            onChange={(v) => setExpires(v)}
            style={{ width: 220 }}
          />
          <Button type="primary" onClick={handleQuery} loading={querying}>
            Query
          </Button>
        </Space>

        {endpoint && (
          <Card size="small" title="Result">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Endpoint">
                <Space>
                  <a href={endpoint.endpoint} target="_blank" rel="noopener noreferrer">
                    <LinkOutlined /> {endpoint.endpoint}
                  </a>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(endpoint.endpoint);
                      message.success('Endpoint copied');
                    }}
                  />
                </Space>
              </Descriptions.Item>
              {endpoint.headers && Object.keys(endpoint.headers).length > 0 && (
                <Descriptions.Item label="Headers">
                  <Space direction="vertical" size={2}>
                    {Object.entries(endpoint.headers).map(([k, v]) => (
                      <Text key={k} code>
                        {k}: {v}
                      </Text>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        )}
      </Space>
    </Card>
  );
}

// =============================================================================
// Tab 4: Logs
// =============================================================================

function LogsTab({ sandboxId }: { sandboxId: string }) {
  const [scope, setScope] = useState<string>('');
  const [tail, setTail] = useState<number>(100);
  const [since, setSince] = useState<string>('');
  const [logs, setLogs] = useState<string>('');
  const [fetching, setFetching] = useState(false);

  const fetchLogs = async () => {
    setFetching(true);
    try {
      const params: { scope?: string; tail?: number; since?: string } = {};
      if (scope) params.scope = scope;
      if (tail) params.tail = tail;
      if (since) params.since = since;
      const data = await getSandboxLogs(sandboxId, params);
      setLogs(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch logs';
      message.error(msg);
      setLogs('');
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Scope (execd, egress, or empty)"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={{ width: 200 }}
          allowClear
        />
        <InputNumber
          min={1}
          max={10000}
          value={tail}
          onChange={(v) => setTail(v || 100)}
          addonBefore="Tail"
          style={{ width: 150 }}
        />
        <Input
          placeholder="Since (e.g. 10m, 1h)"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          style={{ width: 180 }}
          allowClear
        />
        <Button type="primary" icon={<ReloadOutlined />} onClick={fetchLogs} loading={fetching}>
          Refresh
        </Button>
      </Space>
      <div
        style={{
          background: '#1e1e1e',
          borderRadius: 6,
          padding: 16,
          maxHeight: 500,
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            color: '#d4d4d4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          <code>{logs || (fetching ? 'Loading...' : 'Click Refresh to load logs.')}</code>
        </pre>
      </div>
    </Card>
  );
}

// =============================================================================
// Tab 5: Snapshots
// =============================================================================

function SnapshotsTab({ sandbox }: { sandbox: Sandbox }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listSnapshots({ sandboxId: sandbox.id });
      setSnapshots(resp.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to list snapshots';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [sandbox.id]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createSnapshot(sandbox.id, {
        name: snapshotName || undefined,
      });
      message.success('Snapshot created');
      setCreateModalOpen(false);
      setSnapshotName('');
      await fetchSnapshots();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create snapshot';
      message.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    try {
      await deleteSnapshot(snapshotId);
      message.success('Snapshot deleted');
      await fetchSnapshots();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete snapshot';
      message.error(msg);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <Text copyable>{val}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string | null) => val || <Text type="secondary">--</Text>,
    },
    {
      title: 'State',
      dataIndex: ['status', 'state'],
      key: 'state',
      render: (state: string) => <Tag color={snapshotStateColor(state)}>{state}</Tag>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: Snapshot) => {
        const deletable = record.status.state === 'Ready' || record.status.state === 'Failed';
        return (
          <Popconfirm
            title="Delete this snapshot?"
            onConfirm={() => handleDeleteSnapshot(record.id)}
            okText="Delete"
            okType="danger"
            disabled={!deletable}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={!deletable}>
              Delete
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={sandbox.status.state !== 'Running'}
          onClick={() => setCreateModalOpen(true)}
        >
          Create Snapshot
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchSnapshots}>
          Refresh
        </Button>
      </Space>
      <Table
        dataSource={snapshots}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 10 }}
      />

      {/* Create Snapshot Modal */}
      <Modal
        title="Create Snapshot"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          setSnapshotName('');
        }}
        onOk={handleCreate}
        confirmLoading={creating}
      >
        <div>
          <Text strong>Name (optional)</Text>
          <Input
            placeholder="Snapshot name"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>
    </Card>
  );
}
