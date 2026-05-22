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
      if (err && typeof err === 'object' && 'errorFields' in err) return;
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
