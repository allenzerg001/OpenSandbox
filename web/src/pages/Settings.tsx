import React from 'react';
import { Form, Input, Button, Typography, message } from 'antd';
import { getServerUrl, setServerUrl, getApiKey, setApiKey } from '../api/client';

const { Title } = Typography;

interface SettingsFormValues {
  serverUrl: string;
  apiKey: string;
}

const Settings: React.FC = () => {
  const [form] = Form.useForm<SettingsFormValues>();

  const handleSave = (values: SettingsFormValues) => {
    setServerUrl(values.serverUrl);
    setApiKey(values.apiKey);
    message.success('Settings saved successfully');
  };

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <Title level={3}>Settings</Title>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          serverUrl: getServerUrl(),
          apiKey: getApiKey(),
        }}
        onFinish={handleSave}
      >
        <Form.Item
          label="Server URL"
          name="serverUrl"
          rules={[{ required: true, message: 'Please enter the server URL' }]}
        >
          <Input placeholder="http://127.0.0.1:8080" />
        </Form.Item>
        <Form.Item
          label="API Key"
          name="apiKey"
        >
          <Input.Password placeholder="Enter API key" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            Save
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default Settings;
