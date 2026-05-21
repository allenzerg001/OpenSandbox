import React, { useEffect, useState, useCallback } from 'react';
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
  CopyOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import { listSnapshots, deleteSnapshot } from '../api';
import type { Snapshot, SnapshotState, PaginationInfo } from '../types';

const SNAPSHOT_STATES: SnapshotState[] = ['Creating', 'Ready', 'Failed', 'Deleting'];

const stateColors: Record<SnapshotState, string> = {
  Creating: 'gold',
  Ready: 'green',
  Failed: 'red',
  Deleting: 'orange',
};

const SnapshotList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messageApi, contextHolder] = message.useMessage();

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const [sandboxIdFilter, setSandboxIdFilter] = useState(
    searchParams.get('sandboxId') || '',
  );
  const [stateFilter, setStateFilter] = useState<SnapshotState[]>(
    (searchParams.getAll('state') as SnapshotState[]) || [],
  );
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get('pageSize')) || 20,
  );
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.get('page')) || 1,
  );

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await listSnapshots({
        sandboxId: sandboxIdFilter || undefined,
        state: stateFilter.length > 0 ? stateFilter : undefined,
        page: currentPage,
        pageSize,
      });
      setSnapshots(resp.items);
      setPagination(resp.pagination);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to fetch snapshots';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  }, [sandboxIdFilter, stateFilter, currentPage, pageSize, messageApi]);

  useEffect(() => {
    fetchSnapshots();
    const params: Record<string, string> = {};
    if (sandboxIdFilter) params.sandboxId = sandboxIdFilter;
    if (stateFilter.length > 0) params.state = stateFilter.join(',');
    if (pageSize !== 20) params.pageSize = String(pageSize);
    if (currentPage !== 1) params.page = String(currentPage);
    setSearchParams(params, { replace: true });
  }, [sandboxIdFilter, stateFilter, pageSize, currentPage, fetchSnapshots]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSnapshot(id);
      messageApi.success('Snapshot deleted');
      fetchSnapshots();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete snapshot';
      messageApi.error(msg);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    messageApi.success('Copied to clipboard');
  };

  const columns: ColumnsType<Snapshot> = [
    {
      title: 'Snapshot ID',
      dataIndex: 'id',
      key: 'id',
      width: 220,
      render: (id: string) => (
        <Space size="small">
          <Tooltip title={id}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {id.length > 12 ? `${id.slice(0, 12)}...` : id}
            </span>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(id)}
          />
        </Space>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name?: string | null) => name || '-',
    },
    {
      title: 'Source Sandbox',
      dataIndex: 'sandboxId',
      key: 'sandboxId',
      width: 200,
      render: (sandboxId: string) => (
        <Link to={`/sandboxes/${sandboxId}`}>
          <Tooltip title={sandboxId}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {sandboxId.length > 12
                ? `${sandboxId.slice(0, 12)}...`
                : sandboxId}
            </span>
          </Tooltip>
        </Link>
      ),
    },
    {
      title: 'State',
      key: 'state',
      width: 110,
      render: (_: unknown, record: Snapshot) => (
        <Tag color={stateColors[record.status.state]}>
          {record.status.state}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: Snapshot) => (
        <Space size="small">
          <Tooltip title="View Detail">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/snapshots/${record.id}`)}
            >
              View
            </Button>
          </Tooltip>
          {(record.status.state === 'Ready' ||
            record.status.state === 'Failed') && (
            <Popconfirm
              title="Delete snapshot"
              description="Are you sure you want to delete this snapshot?"
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
                >
                  Delete
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}

      <Typography.Title level={3}>Snapshots</Typography.Title>

      {/* Filter Bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="Filter by Sandbox ID"
          value={sandboxIdFilter}
          onChange={(e) => {
            setSandboxIdFilter(e.target.value);
            setCurrentPage(1);
          }}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          mode="multiple"
          placeholder="Filter by State"
          value={stateFilter}
          onChange={(val) => {
            setStateFilter(val);
            setCurrentPage(1);
          }}
          style={{ minWidth: 240 }}
          allowClear
          options={SNAPSHOT_STATES.map((s) => ({ label: s, value: s }))}
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
        <Button icon={<ReloadOutlined />} onClick={fetchSnapshots}>
          Refresh
        </Button>
      </Space>

      {/* Table */}
      <Table<Snapshot>
        rowKey="id"
        columns={columns}
        dataSource={snapshots}
        loading={loading}
        scroll={{ x: 1060 }}
        pagination={{
          current: currentPage,
          pageSize,
          total: pagination?.totalItems || 0,
          showSizeChanger: false,
          onChange: (page) => setCurrentPage(page),
          showTotal: (total) => `Total ${total} snapshots`,
        }}
      />
    </div>
  );
};

export default SnapshotList;
