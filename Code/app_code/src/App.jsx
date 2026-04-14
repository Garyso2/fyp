import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceLogsPage } from './pages/DeviceLogsPage';
import { AddDevicePage } from './pages/AddDevicePage';
import { Header } from './components/Header';

function App() {
  // ============ State Management ============
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('en');
  const [textSize, setTextSize] = useState('medium');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard'); // dashboard | logs | addDevice

  // ============ Event Handlers ============

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    // Read language preference from user data
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
      // Click + button, go to add device page
      setCurrentPage('addDevice');
      setSelectedDevice(null);
    } else {
      // Click device card, go to logs page
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

  // ============ Page Rendering Logic ============

  // Not logged in: show login page
  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        lang={lang}
        setLang={setLang}
      />
    );
  }

  // Logged in: show different pages based on currentPage (with fixed header)
  return (
    <div style={{ paddingTop: '60px' }}>
      <Header onLogout={handleLogout} user={user} lang={lang} />

      {/* Page Content */}
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