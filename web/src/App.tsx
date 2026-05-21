import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import Layout from './components/Layout';
import SandboxList from './pages/SandboxList';
import SandboxDetail from './pages/SandboxDetail';
import SnapshotList from './pages/SnapshotList';
import SnapshotDetail from './pages/SnapshotDetail';
import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/sandboxes" replace />} />
            <Route path="sandboxes" element={<SandboxList />} />
            <Route path="sandboxes/:id" element={<SandboxDetail />} />
            <Route path="snapshots" element={<SnapshotList />} />
            <Route path="snapshots/:id" element={<SnapshotDetail />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
