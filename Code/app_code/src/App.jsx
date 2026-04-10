import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceLogsPage } from './pages/DeviceLogsPage';
import { AddDevicePage } from './pages/AddDevicePage';
import { Header } from './components/Header';

function App() {
  // ============ 狀態管理 ============
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('en');
  const [textSize, setTextSize] = useState('medium');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard'); // dashboard | logs | addDevice

  // ============ 事件處理 ============

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    // 從用戶數據讀取語言偏好
    if (userData?.language) {
      setLang(userData.language);
    }
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentPage('dashboard');
    setSelectedDevice(null);
  };

  const handleSelectDevice = (device) => {
    if (device === null) {
      // 點擊 + 按鈕，進入添加設備頁面
      setCurrentPage('addDevice');
      setSelectedDevice(null);
    } else {
      // 點擊設備卡片，進入日誌頁面
      setSelectedDevice(device);
      setCurrentPage('logs');
    }
  };

  const handleBackFromLogs = () => {
    setCurrentPage('dashboard');
    setSelectedDevice(null);
  };

  const handleBackFromAddDevice = () => {
    setCurrentPage('dashboard');
  };

  // ============ 頁面渲染邏輯 ============

  // 未登入：顯示登入頁面
  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        lang={lang}
        setLang={setLang}
      />
    );
  }

  // 已登入：根據 currentPage 顯示不同頁面（包含固定 header）
  return (
    <div style={{ paddingTop: '60px' }}>
      <Header onLogout={handleLogout} user={user} lang={lang} />

      {/* 頁面內容 */}
      {currentPage === 'logs' && (
        <DeviceLogsPage
          user={user}
          device={selectedDevice}
          onBack={handleBackFromLogs}
          lang={lang}
        />
      )}

      {currentPage === 'addDevice' && (
        <AddDevicePage
          user={user}
          goBack={handleBackFromAddDevice}
          lang={lang}
        />
      )}

      {currentPage === 'dashboard' && (
        <DashboardPage
          user={user}
          onLogout={handleLogout}
          onSelectDevice={handleSelectDevice}
          lang={lang}
          setLang={setLang}
          textSize={textSize}
          setTextSize={setTextSize}
        />
      )}
    </div>
  );
}

export default App;