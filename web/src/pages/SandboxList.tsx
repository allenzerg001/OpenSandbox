import React, { useCallback, useEffect, useState } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Select,
  Input,
  message,
  Popconfirm,
  Tooltip,
  Typography,
} from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import type { Sandbox, SandboxState, PaginationInfo } from '../types';
import { listSandboxes, deleteSandbox, pauseSandbox, resumeSandbox } from '../api';
import CreateSandbox from './CreateSandbox';

const { Text } = Typography;

const ALL_STATES: SandboxState[] = [
  'Pending',
  'Running',
  'Pausing',
  'Paused',
  'Resuming',
  'Stopping',
  'Terminated',
  'Failed',
];

const STATE_COLOR_MAP: Record<SandboxState, string> = {
  Pending: 'default',
  Running: 'green',
  Pausing: 'gold',
  Paused: 'blue',
  Resuming: 'gold',
  Stopping: 'orange',
  Terminated: 'default',
  Failed: 'red',
};

const TRANSITIONAL_STATES: SandboxState[] = ['Pending', 'Pausing', 'Resuming', 'Stopping'];

const SandboxList: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  // Filter state
  const [filterStates, setFilterStates] = useState<SandboxState[]>([]);
  const [metadataFilter, setMetadataFilter] = useState('');
  const [pageSize, setPageSize] = useState(20);

  // Table state
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Drawer state
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  const fetchSandboxes = useCallback(async (page: number, size: number) => {
    setLoading(true);
    try {
      const resp = await listSandboxes({
        state: filterStates.length > 0 ? filterStates : undefined,
        metadata: metadataFilter || undefined,
        page,
        pageSize: size,
      });
      setSandboxes(resp.items);
      setPagination(resp.pagination);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch sandboxes';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filterStates, metadataFilter, messageApi]);

  useEffect(() => {
    fetchSandboxes(currentPage, pageSize);
  }, [currentPage, pageSize, fetchSandboxes]);

  const handleRefresh = () => {
    fetchSandboxes(currentPage, pageSize);
  };

  const handlePause = async (id: string) => {
    try {
      await pauseSandbox(id);
      messageApi.success('Sandbox pause initiated');
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to pause sandbox';
      messageApi.error(msg);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeSandbox(id);
      messageApi.success('Sandbox resume initiated');
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resume sandbox';
      messageApi.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSandbox(id);
      messageApi.success('Sandbox deleted');
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete sandbox';
      messageApi.error(msg);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    messageApi.success('Sandbox ID copied');
  };

  const handleCreateDrawerClose = (created?: boolean) => {
    setCreateDrawerOpen(false);
    if (created) {
      handleRefresh();
    }
  };

  const columns: ColumnsType<Sandbox> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 220,
      render: (id: string) => (
        <Space size="small">
          <Tooltip title={id}>
            <Text code style={{ fontSize: 12 }}>
              {id.length > 16 ? `${id.slice(0, 16)}...` : id}
            </Text>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopyId(id)}
          />
        </Space>
      ),
    },
    {
      title: 'Image',
      key: 'image',
      width: 200,
      render: (_: unknown, record: Sandbox) => {
        const uri = record.image?.uri;
        if (!uri) return '-';
        return (
          <Tooltip title={uri}>
            <Text code style={{ fontSize: 12 }}>
              {uri.length > 30 ? `${uri.slice(0, 30)}...` : uri}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'State',
      key: 'state',
      width: 110,
      render: (_: unknown, record: Sandbox) => (
        <Tag color={STATE_COLOR_MAP[record.status.state]}>
          {record.status.state}
        </Tag>
      ),
    },
    {
      title: 'Message',
      key: 'statusMessage',
      width: 150,
      render: (_: unknown, record: Sandbox) => {
        const msg = record.status.message;
        if (!msg) return '-';
        return (
          <Tooltip title={msg}>
            <span style={{ fontSize: 12 }}>
              {msg.length > 20 ? `${msg.slice(0, 20)}...` : msg}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 170,
      render: (val?: string) => {
        if (!val) return '-';
        const expires = dayjs(val);
        const isExpiringSoon = expires.diff(dayjs(), 'minute') < 10;
        return (
          <span
            style={{
              color: isExpiringSoon ? '#ff4d4f' : undefined,
              fontWeight: isExpiringSoon ? 600 : undefined,
            }}
          >
            {expires.format('YYYY-MM-DD HH:mm:ss')}
          </span>
        );
      },
    },
    {
      title: 'Metadata',
      key: 'metadata',
      width: 200,
      render: (_: unknown, record: Sandbox) => {
        const metadata = record.metadata;
        if (!metadata || Object.keys(metadata).length === 0) return '-';
        const entries = Object.entries(metadata);
        const shown = entries.slice(0, 3);
        const remaining = entries.length - 3;
        return (
          <Space size={[0, 4]} wrap>
            {shown.map(([key, value]) => (
              <Tag key={key} style={{ fontSize: 11 }}>
                {key}={value}
              </Tag>
            ))}
            {remaining > 0 && (
              <Tooltip title={entries.map(([k, v]) => `${k}=${v}`).join(', ')}>
                <Tag color="blue" style={{ fontSize: 11 }}>
                  +{remaining}
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: Sandbox) => {
        const state = record.status.state;
        const isTransitional = TRANSITIONAL_STATES.includes(state);
        return (
          <Space size="small">
            {state === 'Running' && (
              <Tooltip title="Pause">
                <Button
                  type="text"
                  size="small"
                  icon={<PauseCircleOutlined />}
                  onClick={() => handlePause(record.id)}
                />
              </Tooltip>
            )}
            {state === 'Paused' && (
              <Tooltip title="Resume">
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleResume(record.id)}
                />
              </Tooltip>
            )}
            {!isTransitional && (
              <Popconfirm
                title="Delete sandbox"
                description="Are you sure you want to delete this sandbox?"
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Tooltip title="Delete">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            <Tooltip title="View Detail">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => navigate(`/sandboxes/${record.id}`)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}

      {/* Filter Bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          mode="multiple"
          allowClear
          placeholder="Filter by state"
          style={{ minWidth: 240 }}
          value={filterStates}
          onChange={(values) => {
            setFilterStates(values);
            setCurrentPage(1);
          }}
          options={ALL_STATES.map((s) => ({ label: s, value: s }))}
        />
        <Input
          placeholder="Metadata filter (key=value)"
          style={{ width: 220 }}
          value={metadataFilter}
          onChange={(e) => setMetadataFilter(e.target.value)}
          onPressEnter={() => {
            setCurrentPage(1);
            handleRefresh();
          }}
          allowClear
        />
        <Select
          value={pageSize}
          onChange={(val) => {
            setPageSize(val);
            setCurrentPage(1);
          }}
          style={{ width: 120 }}
          options={[
            { label: '10 / page', value: 10 },
            { label: '20 / page', value: 20 },
            { label: '50 / page', value: 50 },
            { label: '100 / page', value: 100 },
          ]}
        />
      </Space>

      {/* Action Bar */}
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateDrawerOpen(true)}
        >
          Create Sandbox
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
          Refresh
        </Button>
      </Space>

      {/* Table */}
      <Table<Sandbox>
        rowKey="id"
        columns={columns}
        dataSource={sandboxes}
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.totalItems,
          showSizeChanger: false,
          onChange: (page) => setCurrentPage(page),
        }}
      />

      {/* Create Drawer */}
      <CreateSandbox open={createDrawerOpen} onClose={handleCreateDrawerClose} />
    </div>
  );
};

export default SandboxList;
