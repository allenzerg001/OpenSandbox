import React from 'react';
import { Layout as AntLayout, Menu, Typography } from 'antd';
import { CloudServerOutlined, CameraOutlined, KeyOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = AntLayout;
const { Title } = Typography;

const menuItems = [
  {
    key: '/sandboxes',
    icon: <CloudServerOutlined />,
    label: 'Sandboxes',
  },
  {
    key: '/snapshots',
    icon: <CameraOutlined />,
    label: 'Snapshots',
  },
  { key: '/access-keys', icon: <KeyOutlined />, label: 'Access Keys' },
];

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={80}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Title level={5} style={{ color: '#fff', margin: 0 }}>
            OpenSandbox
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>OpenSandbox</Title>
        </Header>
        <Content style={{ margin: 0, background: '#fff', minHeight: 280 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
