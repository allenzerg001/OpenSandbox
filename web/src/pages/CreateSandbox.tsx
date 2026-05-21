import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Switch,
  Segmented,
  Collapse,
  message,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

import type { CreateSandboxRequest, Volume } from '../types';
import { createSandbox } from '../api';

interface CreateSandboxProps {
  open: boolean;
  onClose: (created?: boolean) => void;
  snapshotId?: string;
}

interface VolumeFormValue {
  name?: string;
  mountPath?: string;
  readOnly?: boolean;
  type?: 'host' | 'pvc' | 'ossfs';
  hostPath?: string;
  claimName?: string;
  bucket?: string;
  endpoint?: string;
}

type SandboxSource = 'image' | 'snapshot';

interface FormValues {
  uri?: string;
  auth_username?: string;
  auth_password?: string;
  snapshotId?: string;
  os?: string;
  arch?: string;
  entrypoint?: string[];
  timeout?: number;
  resourceLimits?: { key: string; value: string }[];
  env?: { key: string; value: string }[];
  networkDefaultAction?: string;
  egress?: { action: string; target: string }[];
  volumes?: VolumeFormValue[];
  metadata?: { key: string; value: string }[];
  extensions?: { key: string; value: string }[];
}

const CreateSandbox: React.FC<CreateSandboxProps> = ({ open, onClose, snapshotId }) => {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [source, setSource] = useState<SandboxSource>(snapshotId ? 'snapshot' : 'image');
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    if (!open) {
      return;
    }
    const baseDefaults = {
      timeout: 3600,
      resourceLimits: [
        { key: 'cpu', value: '1' },
        { key: 'memory', value: '512Mi' },
      ],
      entrypoint: ['tail', '-f', '/dev/null'],
    };
    if (snapshotId) {
      setSource('snapshot');
      form.setFieldsValue({ ...baseDefaults, snapshotId });
    } else {
      setSource('image');
      form.setFieldsValue({
        ...baseDefaults,
        os: 'linux',
        arch: 'amd64',
        uri: 'opensandbox/code-interpreter:v1.0.2',
      });
    }
  }, [open, snapshotId, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const req: CreateSandboxRequest = {};

      if (source === 'image') {
        // Image
        const imageObj: CreateSandboxRequest['image'] = { uri: values.uri || '' };
        if (values.auth_username || values.auth_password) {
          imageObj!.auth = {
            username: values.auth_username || '',
            password: values.auth_password || '',
          };
        }
        req.image = imageObj;
      } else {
        // Snapshot
        req.snapshotId = values.snapshotId || '';
      }

      // Platform — only meaningful for image mode (snapshot is restored from
      // a local-only docker image and re-applying a platform constraint causes
      // the runtime to attempt a registry pull which fails with 404).
      if (source === 'image' && (values.os || values.arch)) {
        req.platform = {
          os: values.os || '',
          arch: values.arch || '',
        };
      }

      // Entrypoint
      if (values.entrypoint && values.entrypoint.length > 0) {
        const entries = values.entrypoint.filter((s) => s !== undefined && s !== '');
        if (entries.length > 0) {
          req.entrypoint = entries;
        }
      }

      // Timeout
      if (values.timeout != null) {
        req.timeout = values.timeout;
      }

      // Resource Limits
      if (values.resourceLimits && values.resourceLimits.length > 0) {
        const limits: Record<string, string> = {};
        for (const entry of values.resourceLimits) {
          if (entry.key) {
            limits[entry.key] = entry.value || '';
          }
        }
        if (Object.keys(limits).length > 0) {
          req.resourceLimits = limits;
        }
      }

      // Environment Variables
      if (values.env && values.env.length > 0) {
        const envMap: Record<string, string> = {};
        for (const entry of values.env) {
          if (entry.key) {
            envMap[entry.key] = entry.value || '';
          }
        }
        if (Object.keys(envMap).length > 0) {
          req.env = envMap;
        }
      }

      // Network Policy
      const hasDefaultAction = !!values.networkDefaultAction;
      const hasEgress = values.egress && values.egress.length > 0;
      if (hasDefaultAction || hasEgress) {
        req.networkPolicy = {};
        if (hasDefaultAction) {
          req.networkPolicy.defaultAction = values.networkDefaultAction;
        }
        if (hasEgress) {
          req.networkPolicy.egress = values.egress!
            .filter((r) => r.action && r.target)
            .map((r) => ({ action: r.action, target: r.target }));
        }
      }

      // Volumes
      if (values.volumes && values.volumes.length > 0) {
        req.volumes = values.volumes
          .filter((v) => v.name && v.mountPath && v.type)
          .map((v) => {
            const vol: Volume = {
              name: v.name!,
              mountPath: v.mountPath!,
              readOnly: v.readOnly,
            };
            if (v.type === 'host' && v.hostPath) {
              vol.host = { path: v.hostPath };
            } else if (v.type === 'pvc' && v.claimName) {
              vol.pvc = { claimName: v.claimName };
            } else if (v.type === 'ossfs' && v.bucket) {
              vol.ossfs = {
                bucket: v.bucket,
                endpoint: v.endpoint || '',
              };
            }
            return vol;
          });
      }

      // Metadata
      if (values.metadata && values.metadata.length > 0) {
        const meta: Record<string, string> = {};
        for (const entry of values.metadata) {
          if (entry.key) {
            meta[entry.key] = entry.value || '';
          }
        }
        if (Object.keys(meta).length > 0) {
          req.metadata = meta;
        }
      }

      // Extensions
      if (values.extensions && values.extensions.length > 0) {
        const ext: Record<string, string> = {};
        for (const entry of values.extensions) {
          if (entry.key) {
            ext[entry.key] = entry.value || '';
          }
        }
        if (Object.keys(ext).length > 0) {
          req.extensions = ext;
        }
      }

      await createSandbox(req);
      messageApi.success('Sandbox created successfully');
      form.resetFields();
      onClose(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      // Surface backend error details (axios errors have response.data.detail or .message)
      let msg = 'Failed to create sandbox';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: unknown } }).response;
        const data = resp?.data;
        if (data && typeof data === 'object') {
          if ('detail' in data) {
            const detail = (data as { detail: unknown }).detail;
            if (typeof detail === 'string') {
              msg = detail;
            } else if (Array.isArray(detail)) {
              msg = detail
                .map((d: { loc?: unknown[]; msg?: string }) => {
                  const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
                  return `${loc}: ${d.msg ?? ''}`;
                })
                .join('; ');
            }
          } else if ('message' in data) {
            msg = String((data as { message: unknown }).message);
          }
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const renderKeyValueList = (
    fieldName: string,
    addLabel: string,
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
  ) => (
    <Form.List name={fieldName}>
      {(fields, { add, remove }) => (
        <>
          {fields.map(({ key, name, ...restField }) => (
            <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
              <Form.Item
                {...restField}
                name={[name, 'key']}
                noStyle
                rules={[{ required: true, message: `${keyPlaceholder} required` }]}
              >
                <Input placeholder={keyPlaceholder} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item {...restField} name={[name, 'value']} noStyle>
                <Input placeholder={valuePlaceholder} style={{ width: 240 }} />
              </Form.Item>
              <MinusCircleOutlined onClick={() => remove(name)} />
            </Space>
          ))}
          <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
            {addLabel}
          </Button>
        </>
      )}
    </Form.List>
  );

  const sourcePanel =
    source === 'image'
      ? [
          {
            key: 'image',
            label: 'Image',
            forceRender: true,
            children: (
              <Form.Item
                name="uri"
                label="Image URI"
                rules={[{ required: true, message: 'Image URI is required' }]}
              >
                <Input placeholder="python:3.11" />
              </Form.Item>
            ),
          },
          {
            key: 'imageAuth',
            label: 'Image Auth',
            forceRender: true,
            children: (
              <>
                <Form.Item name="auth_username" label="Username">
                  <Input placeholder="Username" />
                </Form.Item>
                <Form.Item name="auth_password" label="Password">
                  <Input.Password placeholder="Password" />
                </Form.Item>
              </>
            ),
          },
        ]
      : [
          {
            key: 'snapshot',
            label: 'Snapshot',
            forceRender: true,
            children: (
              <Form.Item
                name="snapshotId"
                label="Snapshot ID"
                rules={[{ required: true, message: 'Snapshot ID is required' }]}
              >
                <Input placeholder="snap-..." />
              </Form.Item>
            ),
          },
        ];

  const collapseItems = [
    ...sourcePanel,
    {
      key: 'platform',
      label: 'Platform',
      forceRender: true,
      children: (
        <>
          <Form.Item name="os" label="OS">
            <Select placeholder="Select OS" allowClear>
              <Select.Option value="linux">linux</Select.Option>
              <Select.Option value="windows">windows</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="arch" label="Architecture">
            <Select placeholder="Select Architecture" allowClear>
              <Select.Option value="amd64">amd64</Select.Option>
              <Select.Option value="arm64">arm64</Select.Option>
            </Select>
          </Form.Item>
        </>
      ),
    },
    {
      key: 'entrypoint',
      label: 'Entrypoint',
      forceRender: true,
      children: (
        <Form.List
          name="entrypoint"
          rules={
            source === 'image'
              ? [
                  {
                    validator: async (_, value: string[] | undefined) => {
                      const entries = (value || []).filter((s) => s !== undefined && s !== '');
                      if (entries.length === 0) {
                        return Promise.reject(
                          new Error('Entrypoint is required when creating from an image'),
                        );
                      }
                      return Promise.resolve();
                    },
                  },
                ]
              : undefined
          }
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item {...restField} name={name} noStyle>
                    <Input placeholder="Command segment" style={{ width: 360 }} />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(name)} />
                </Space>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                Add Entrypoint Segment
              </Button>
              <Form.ErrorList errors={errors} />
            </>
          )}
        </Form.List>
      ),
    },
    {
      key: 'timeout',
      label: 'Timeout',
      forceRender: true,
      children: (
        <Form.Item
          name="timeout"
          label="Timeout (seconds)"
          rules={[{ type: 'number', min: 60, message: 'Minimum timeout is 60 seconds' }]}
        >
          <InputNumber
            placeholder="e.g. 3600"
            min={60}
            style={{ width: '100%' }}
            addonAfter="seconds"
          />
        </Form.Item>
      ),
    },
    {
      key: 'resourceLimits',
      label: 'Resource Limits (required)',
      forceRender: true,
      children: (
        <>
          <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
            Required by backend. At minimum specify <code>cpu</code> and <code>memory</code>.
          </div>
          {renderKeyValueList(
            'resourceLimits',
            'Add Resource Limit',
            'Resource (e.g. cpu)',
            'Limit (e.g. 500m)',
          )}
        </>
      ),
    },
    {
      key: 'env',
      label: 'Environment Variables',
      forceRender: true,
      children: renderKeyValueList('env', 'Add Environment Variable', 'Name', 'Value'),
    },
    {
      key: 'network',
      label: 'Network Policy',
      forceRender: true,
      children: (
        <>
          <Form.Item name="networkDefaultAction" label="Default Action">
            <Select placeholder="Select default action" allowClear>
              <Select.Option value="allow">allow</Select.Option>
              <Select.Option value="deny">deny</Select.Option>
            </Select>
          </Form.Item>
          <Form.List name="egress">
            {(fields, { add, remove }) => (
              <>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>Egress Rules</div>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'action']}
                      noStyle
                      rules={[{ required: true, message: 'Action required' }]}
                    >
                      <Select placeholder="Action" style={{ width: 110 }}>
                        <Select.Option value="allow">allow</Select.Option>
                        <Select.Option value="deny">deny</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'target']}
                      noStyle
                      rules={[{ required: true, message: 'Target domain required' }]}
                    >
                      <Input placeholder="Domain (e.g. example.com)" style={{ width: 260 }} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add Egress Rule
                </Button>
              </>
            )}
          </Form.List>
        </>
      ),
    },
    {
      key: 'volumes',
      label: 'Volumes',
      forceRender: true,
      children: (
        <Form.List name="volumes">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }) => (
                <div
                  key={key}
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    position: 'relative',
                  }}
                >
                  <MinusCircleOutlined
                    onClick={() => remove(name)}
                    style={{ position: 'absolute', top: 12, right: 12 }}
                  />
                  <Form.Item
                    {...restField}
                    name={[name, 'name']}
                    label="Name"
                    rules={[{ required: true, message: 'Volume name required' }]}
                  >
                    <Input placeholder="volume-name" />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'mountPath']}
                    label="Mount Path"
                    rules={[{ required: true, message: 'Mount path required' }]}
                  >
                    <Input placeholder="/mnt/data" />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'readOnly']}
                    label="Read Only"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'type']}
                    label="Type"
                    rules={[{ required: true, message: 'Type required' }]}
                  >
                    <Select placeholder="Volume type">
                      <Select.Option value="host">Host</Select.Option>
                      <Select.Option value="pvc">PVC</Select.Option>
                      <Select.Option value="ossfs">OSSFS</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => {
                      const prevVols = prev.volumes as VolumeFormValue[] | undefined;
                      const curVols = cur.volumes as VolumeFormValue[] | undefined;
                      return prevVols?.[name]?.type !== curVols?.[name]?.type;
                    }}
                  >
                    {({ getFieldValue }) => {
                      const type = getFieldValue(['volumes', name, 'type']) as string | undefined;
                      if (type === 'host') {
                        return (
                          <Form.Item {...restField} name={[name, 'hostPath']} label="Host Path">
                            <Input placeholder="/host/path" />
                          </Form.Item>
                        );
                      }
                      if (type === 'pvc') {
                        return (
                          <Form.Item {...restField} name={[name, 'claimName']} label="Claim Name">
                            <Input placeholder="my-pvc" />
                          </Form.Item>
                        );
                      }
                      if (type === 'ossfs') {
                        return (
                          <>
                            <Form.Item {...restField} name={[name, 'bucket']} label="Bucket">
                              <Input placeholder="bucket-name" />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, 'endpoint']} label="Endpoint">
                              <Input placeholder="oss-cn-hangzhou.aliyuncs.com" />
                            </Form.Item>
                          </>
                        );
                      }
                      return null;
                    }}
                  </Form.Item>
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                Add Volume
              </Button>
            </>
          )}
        </Form.List>
      ),
    },
    {
      key: 'metadata',
      label: 'Metadata',
      forceRender: true,
      children: renderKeyValueList('metadata', 'Add Metadata'),
    },
    {
      key: 'extensions',
      label: 'Extensions',
      forceRender: true,
      children: renderKeyValueList('extensions', 'Add Extension'),
    },
  ];

  const defaultActiveKey = source === 'image' ? ['image'] : ['snapshot'];

  return (
    <>
      {contextHolder}
      <Drawer
        title="Create Sandbox"
        placement="right"
        width={640}
        open={open}
        onClose={handleClose}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="primary" onClick={handleSubmit} loading={submitting}>
              Create
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item label="Source">
            <Segmented<SandboxSource>
              value={source}
              onChange={(value) => setSource(value)}
              options={[
                { label: 'From Image', value: 'image' },
                { label: 'From Snapshot', value: 'snapshot' },
              ]}
              block
            />
          </Form.Item>
          <Collapse
            key={source}
            defaultActiveKey={defaultActiveKey}
            items={collapseItems}
            bordered={false}
            style={{ background: 'transparent' }}
          />
        </Form>
      </Drawer>
    </>
  );
};

export default CreateSandbox;
