import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceLogsPage } from './pages/DeviceLogsPage';
import { AddDevicePage } from './pages/AddDevicePage';
import { WifiSetupPage } from './pages/WifiSetupPage';
import { BluetoothSetupPage } from './pages/BluetoothSetupPage';
import { Header } from './components/Header';

function App() {
  // ============ State Management ============
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('en');
  const [textSize, setTextSize] = useState('medium');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPage, setCurrentPage] = useState('dashboard'); // dashboard | logs | addDevice | wifiSetup | bluetoothSetup

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

  const handleSetupWifi = (device) => {
    console.log('🛠️ [App] Setting up WiFi for device:', device?.device_id);
    setSelectedDevice(device);
    setCurrentPage('wifiSetup');
  };

  const handleBackFromWifiSetup = () => {
    console.log('🔙 [App] Returning from WiFi setup');
    setCurrentPage('logs');
    // Keep selectedDevice so logs page can still access it
  };

  const handleSetupBluetooth = (device) => {
    setSelectedDevice(device);
    setCurrentPage('bluetoothSetup');
  };

  const handleBackFromBluetoothSetup = () => {
    setCurrentPage('logs');
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
          onSetupWifi={handleSetupWifi}
          onSetupBluetooth={handleSetupBluetooth}
          lang={lang}
        />
      )}

      {currentPage === 'wifiSetup' && selectedDevice && (
        <WifiSetupPage
          user={user}
          device={selectedDevice}
          goBack={handleBackFromWifiSetup}
          lang={lang}
        />
      )}

      {currentPage === 'wifiSetup' && !selectedDevice && (
        <div className="d-flex justify-content-center align-items-center" style={{ paddingTop: '60px', minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
          <div className="card shadow-sm">
            <div className="card-body text-center p-5">
              <i className="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
              <h5>Device Not Found</h5>
              <p className="text-muted">Please select a device first</p>
              <button onClick={() => setCurrentPage('dashboard')} className="btn btn-primary">
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {currentPage === 'bluetoothSetup' && (
        <BluetoothSetupPage
          user={user}
          device={selectedDevice}
          goBack={handleBackFromBluetoothSetup}
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