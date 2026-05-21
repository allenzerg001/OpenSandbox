import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Descriptions,
  Tag,
  Button,
  Popconfirm,
  Typography,
  Spin,
  Space,
  message,
} from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { getSnapshot, deleteSnapshot } from '../api';
import type { Snapshot, SnapshotState } from '../types';

const { Title, Text } = Typography;

const stateColors: Record<SnapshotState, string> = {
  Creating: 'gold',
  Ready: 'green',
  Failed: 'red',
  Deleting: 'orange',
};

const SnapshotDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getSnapshot(id);
      setSnapshot(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to fetch snapshot';
      messageApi.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteSnapshot(id);
      messageApi.success('Snapshot deleted');
      navigate('/snapshots');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete snapshot';
      messageApi.error(msg);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div style={{ padding: 24 }}>
        <Title level={4}>Snapshot not found</Title>
        <Button onClick={() => navigate('/snapshots')}>Back to Snapshots</Button>
      </div>
    );
  }

  const canDelete =
    snapshot.status.state === 'Ready' || snapshot.status.state === 'Failed';

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Snapshot Detail
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchSnapshot}>
            Refresh
          </Button>
          {canDelete && (
            <Popconfirm
              title="Delete snapshot"
              description="Are you sure you want to delete this snapshot?"
              onConfirm={handleDelete}
              okText="Yes"
              cancelText="No"
            >
              <Button danger type="primary" icon={<DeleteOutlined />}>
                Delete Snapshot
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Descriptions bordered column={1}>
        <Descriptions.Item label="Snapshot ID">
          <Text copyable>{snapshot.id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Name">
          {snapshot.name || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Source Sandbox">
          <Link to={`/sandboxes/${snapshot.sandboxId}`}>
            {snapshot.sandboxId}
          </Link>
        </Descriptions.Item>
        <Descriptions.Item label="State">
          <Tag color={stateColors[snapshot.status.state]}>
            {snapshot.status.state}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Message">
          {snapshot.status.message || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Reason">
          {snapshot.status.reason || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Created At">
          {dayjs(snapshot.createdAt).format('YYYY-MM-DD HH:mm:ss')}
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
};

export default SnapshotDetail;
