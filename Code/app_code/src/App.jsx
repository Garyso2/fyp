import React, { useState, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceLogsPage } from './pages/DeviceLogsPage';
import { AddDevicePage } from './pages/AddDevicePage';
import { WifiSetupPage } from './pages/WifiSetupPage';
import { BluetoothSetupPage } from './pages/BluetoothSetupPage';
import { Header } from './components/Header';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ActivityLogService } from './services/activityLog.service';
import { UserDeviceDB } from './db/userDevice.db';
import { PAGES, SESSION_KEY, ACTIVITY_TYPES } from './constants';

function App() {
  // ============ State Management ============
  // Restore saved session on startup; cleared on reinstall or explicit logout
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [lang, setLang] = useState('en');
  const [textSize, setTextSize] = useState('medium');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [currentPage, setCurrentPage] = useState(PAGES.DASHBOARD);
  const [lastCheckTime, setLastCheckTime] = useState(new Date().toISOString()); // Track time of last notification check
  
  // ============ Fall Detection Notification Polling ============
  useEffect(() => {
    if (!user?.user_id) {
      return; // Don't poll if not logged in
    }

    // Initialize LocalNotifications permissions
    const initNotifications = async () => {
      try {
        const result = await LocalNotifications.requestPermissions();
        if (result.display !== 'granted') {
          console.warn('⚠️ Notification permissions not granted');
        }
      } catch (error) {
        console.error('❌ Failed to request notification permissions:', error);
      }
    };
    initNotifications();

    // Handle notification click
    const setupNotificationListener = async () => {
      try {
        LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
          if (notification.actionId === ACTIVITY_TYPES.FALL_DETECTION || notification.notification.actionTypeId === ACTIVITY_TYPES.FALL_DETECTION) {
            // Navigate to device logs page
            setCurrentPage(PAGES.LOGS);
            console.log('📱 Navigating to logs due to Fall Detection notification click');
          }
        });
      } catch (error) {
        console.warn('⚠️ Notification listener setup (may not be supported on web):', error);
      }
    };
    setupNotificationListener();

    // Poll for FALL_DETECTION logs every 10 seconds
    const pollInterval = setInterval(async () => {
      try {
        // Get user's devices from database
        const devices = await UserDeviceDB.findDevicesByUser(user.user_id);
        if (!devices || !devices.length) return;

        // Check latest logs for each device
        for (const device of devices) {
          const result = await ActivityLogService.getDeviceLogs(device.device_id, 5, 1);
          if (!result.ok || !result.logs) continue;

          // Look for recent FALL_DETECTION
          for (const log of result.logs) {
            if (log.activity_type === ACTIVITY_TYPES.FALL_DETECTION) {
              const logTime = new Date(log.time);
              // Only notify if this log is newer than last check
              if (logTime > new Date(lastCheckTime)) {
                // Show notification
                try {
                  await LocalNotifications.schedule({
                    notifications: [
                      {
                        id: Math.floor(Math.random() * 10000),
                        title: '⚠️ Fall Detection Alert',
                        body: `User have Fall Detection - Device: ${device.device_name || device.device_id}`,
                        smallIcon: 'res://drawable/notification_icon',
                        actionTypeId: ACTIVITY_TYPES.FALL_DETECTION
                      }
                    ]
                  });
                  console.log('📳 Fall Detection notification sent for device:', device.device_id);
                  setLastCheckTime(new Date().toISOString());
                } catch (notifError) {
                  console.error('❌ Failed to schedule notification:', notifError);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('⚠️ Fall detection poll error:', error);
      }
    }, 10000); // Poll every 10 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [user?.user_id, lastCheckTime]);

  // ============ Event Handlers ============

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    // Persist session so app reopens without requiring login
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(userData)); } catch { /* ignore */ }
    // Read language preference from user data
    if (userData?.language) {
      setLang(userData.language);
    }
    setCurrentPage(PAGES.DASHBOARD);
  };

  const handleLogout = () => {
    // Clear persisted session on explicit logout
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setUser(null);
    setCurrentPage(PAGES.DASHBOARD);
    setSelectedDevice(null);
  };

  const handleSelectDevice = (device) => {
    if (device === null) {
      // Click + button, go to add device page
      setCurrentPage(PAGES.ADD_DEVICE);
      setSelectedDevice(null);
    } else {
      // Click device card, go to logs page
      setSelectedDevice(device);
      setCurrentPage(PAGES.LOGS);
    }
  };

  const handleBackFromLogs = () => {
    setCurrentPage(PAGES.DASHBOARD);
    setSelectedDevice(null);
  };

  const handleBackFromAddDevice = () => {
    setCurrentPage(PAGES.DASHBOARD);
  };

  const handleSetupWifi = (device) => {
    console.log('🛠️ [App] Setting up WiFi for device:', device?.device_id);
    setSelectedDevice(device);
    setCurrentPage(PAGES.WIFI_SETUP);
  };

  const handleBackFromWifiSetup = () => {
    console.log('🔙 [App] Returning from WiFi setup');
    setCurrentPage(PAGES.LOGS);
    // Keep selectedDevice so logs page can still access it
  };

  const handleSetupBluetooth = (device) => {
    setSelectedDevice(device);
    setCurrentPage(PAGES.BLUETOOTH_SETUP);
  };

  const handleBackFromBluetoothSetup = () => {
    setCurrentPage(PAGES.LOGS);
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
      {currentPage === PAGES.LOGS && (
        <DeviceLogsPage
          user={user}
          device={selectedDevice}
          onBack={handleBackFromLogs}
          onSetupWifi={handleSetupWifi}
          onSetupBluetooth={handleSetupBluetooth}
          lang={lang}
        />
      )}

      {currentPage === PAGES.WIFI_SETUP && selectedDevice && (
        <WifiSetupPage
          user={user}
          device={selectedDevice}
          goBack={handleBackFromWifiSetup}
          lang={lang}
        />
      )}

      {currentPage === PAGES.WIFI_SETUP && !selectedDevice && (
        <div className="d-flex justify-content-center align-items-center" style={{ paddingTop: '60px', minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
          <div className="card shadow-sm">
            <div className="card-body text-center p-5">
              <i className="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
              <h5>Device Not Found</h5>
              <p className="text-muted">Please select a device first</p>
              <button onClick={() => setCurrentPage(PAGES.DASHBOARD)} className="btn btn-primary">
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {currentPage === PAGES.BLUETOOTH_SETUP && (
        <BluetoothSetupPage
          user={user}
          device={selectedDevice}
          goBack={handleBackFromBluetoothSetup}
          lang={lang}
        />
      )}

      {currentPage === PAGES.ADD_DEVICE && (
        <AddDevicePage
          user={user}
          goBack={handleBackFromAddDevice}
          lang={lang}
        />
      )}

      {currentPage === PAGES.DASHBOARD && (
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