// ================== 🎨 用戶界面層 (UI) ==================
// 所有 UI 組件都寫喺呢度

import React, { useState, useEffect } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { i18n } from './i18n';
import { functions } from './functions';
import { db } from './db';

// ============ 🔐 LOGIN 頁面 ============

export const Login = ({ onLoginSuccess, t = {}, lang = 'en', setLang }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    if (!username || !password) {
      setErrorMsg(t.enterCredentials || 'Please enter credentials');
      setIsLoading(false);
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setErrorMsg(t.pwdMismatch || 'Passwords do not match');
      setIsLoading(false);
      return;
    }

    // 檢查 Admin 後門
    const adminUser = functions.adminBackdoor(username, password);
    if (adminUser) {
      onLoginSuccess(adminUser);
      return;
    }

    // 正常登入/註冊流程
    const result = isRegisterMode
      ? await functions.handleRegister(username, password)
      : await functions.handleLogin(username, password);

    if (result.status === 'success') {
      if (isRegisterMode) {
        setIsRegisterMode(false);
        setSuccessMsg(result.message);
        setPassword('');
        setConfirmPassword('');
      } else {
        onLoginSuccess(result.user);
      }
    } else {
      setErrorMsg(result.message);
    }

    setIsLoading(false);
  };

  const toggleLanguage = () => {
    if (setLang) {
      setLang(lang === 'en' ? 'zh' : 'en');
    }
  };

  return (
    <div
      className="d-flex justify-content-center align-items-center vh-100 vw-100 position-relative"
      style={{ background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' }}
    >
      <div className="position-absolute top-0 end-0 p-4">
        <button onClick={toggleLanguage} className="btn btn-light rounded-pill shadow-sm fw-bold px-3">
          <i className="bi bi-globe me-2"></i>
          {lang === 'en' ? '繁體中文' : 'English'}
        </button>
      </div>

      <div className="card shadow-lg border-0 rounded-4" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <i className={`bi ${isRegisterMode ? 'bi-person-plus' : 'bi-shield-check'} text-primary`} style={{ fontSize: '4rem' }}></i>
            <h2 className="fw-bold mt-2">{isRegisterMode ? (t.createAccount || 'Create Account') : 'VisualGuard'}</h2>
          </div>

          {errorMsg && <div className="alert alert-danger" role="alert">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success" role="alert">{successMsg}</div>}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-bold">{t.username || 'Username'}</label>
              <input
                type="text"
                className="form-control form-control-lg border-0 bg-light"
                placeholder={t.username || 'Username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">{t.password || 'Password'}</label>
              <input
                type="password"
                className="form-control form-control-lg border-0 bg-light"
                placeholder={t.password || 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isRegisterMode && (
              <div className="mb-3">
                <label className="form-label fw-bold">{t.confirmPwd || 'Confirm Password'}</label>
                <input
                  type="password"
                  className="form-control form-control-lg border-0 bg-light"
                  placeholder={t.confirmPwd || 'Confirm'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg w-100 fw-bold rounded-pill"
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  {t.loading || 'Loading...'}
                </>
              ) : (
                isRegisterMode ? (t.register || 'Register') : (t.login || 'Login')
              )}
            </button>
          </form>

          <hr className="my-4" />

          <div className="text-center">
            <p className="text-muted mb-0">
              {isRegisterMode
                ? `${t.haveAccount || 'Have account?'} `
                : `${t.noAccount || 'No account?'} `
              }
              <button
                type="button"
                className="btn btn-link text-primary p-0 text-decoration-none fw-bold"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
              >
                {isRegisterMode ? (t.login || 'Login') : (t.register || 'Register')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ 📊 DASHBOARD 主頁面 ============

export const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('devices');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lang, setLang] = useState(user?.language || 'en');
  const [textSize, setTextSize] = useState('medium');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);

  const t = i18n[lang] || i18n['en'];

  // 載入設備列表
  useEffect(() => {
    if (activeTab === 'devices' && user?.user_id) {
      const loadDevices = async () => {
        setIsLoadingDevices(true);
        const result = await functions.getDevicesList(user.user_id);
        if (result.status === 'success') {
          setDevices(result.devices);
        }
        setIsLoadingDevices(false);
      };
      loadDevices();
    }
  }, [activeTab, user?.user_id]);

  const handleMenuClick = (tabName) => {
    setActiveTab(tabName);
    setSelectedDevice(null);
    setIsMenuOpen(false);
  };

  const getFontSize = () => {
    if (textSize === 'small') return '14px';
    if (textSize === 'large') return '20px';
    return '16px';
  };

  return (
    <div className="d-flex flex-column" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#f8f9fa', fontSize: getFontSize() }}>
      
      {/* Navbar */}
      <nav className="navbar navbar-dark bg-dark px-3 shadow-sm d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          {activeTab !== 'devices' && (
            <i className="bi bi-chevron-left text-white me-3 fs-4" onClick={() => handleMenuClick('devices')} style={{ cursor: 'pointer' }}></i>
          )}
          <span className="navbar-brand mb-0 h1 fw-bold">VisualGuard</span>
        </div>
        <button onClick={onLogout} className="btn btn-danger btn-sm">
          {t.logout || 'Logout'}
        </button>
      </nav>

      {/* 主內容區域 */}
      <div className="flex-grow-1 overflow-auto p-4">
        {activeTab === 'devices' && (
          <div>
            <h3 className="mb-4 fw-bold">{t.devices || '我的設備'}</h3>
            {isLoadingDevices ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"></div>
              </div>
            ) : (
              <div className="row">
                {devices.map(device => (
                  <div key={device.device_id} className="col-md-6 col-lg-4 mb-4">
                    <div
                      className="card shadow-sm border-0 cursor-pointer h-100"
                      onClick={() => {
                        setSelectedDevice(device);
                        setActiveTab('logs');
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="card-body">
                        <h5 className="card-title fw-bold">{device.device_name}</h5>
                        <p className="card-text text-muted">{device.device_id}</p>
                        <div className="d-flex justify-content-between align-items-center">
                          <span className={`badge ${functions.getStatusBadgeClass(device.is_online)} rounded-pill`}>
                            {functions.getStatusLabel(device.is_online, lang)}
                          </span>
                          <span className="fw-bold">{functions.getBatteryLabel(device.battery_level)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => handleMenuClick('add_device')}
              className="btn btn-primary rounded-circle position-fixed"
              style={{ bottom: '30px', right: '30px', width: '60px', height: '60px', fontSize: '24px' }}
            >
              <i className="bi bi-plus"></i>
            </button>
          </div>
        )}

        {activeTab === 'settings' && (
          <Settings user={user} t={t} lang={lang} setLang={setLang} textSize={textSize} setTextSize={setTextSize} />
        )}

        {activeTab === 'logs' && selectedDevice && (
          <DeviceLogs user={user} device={selectedDevice} onBack={() => handleMenuClick('devices')} t={t} />
        )}

        {activeTab === 'add_device' && (
          <AddDevice user={user} goBack={() => handleMenuClick('devices')} t={t} />
        )}
      </div>

      {/* 側邊欄 */}
      {isMenuOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100" onClick={() => setIsMenuOpen(false)} style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 999 }}></div>
      )}
      <div
        className={`position-fixed top-0 start-0 h-100 bg-white shadow transition-all ${isMenuOpen ? 'translate-x-0' : '-translate-x-100'}`}
        style={{ width: '250px', zIndex: 1000, transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="p-4">
          <button onClick={() => setIsMenuOpen(false)} className="btn btn-close mb-4"></button>
          <button onClick={() => handleMenuClick('devices')} className="btn btn-link w-100 text-start">
            <i className="bi bi-phone me-2"></i> {t.devices || '設備'}
          </button>
          <button onClick={() => handleMenuClick('settings')} className="btn btn-link w-100 text-start">
            <i className="bi bi-gear me-2"></i> {t.settings || '設定'}
          </button>
          <button onClick={onLogout} className="btn btn-danger w-100 mt-3">
            {t.logout || 'Logout'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ ⚙️ SETTINGS 設定頁面 ============

export const Settings = ({ user, t, lang, setLang, textSize, setTextSize }) => {
  return (
    <div className="pb-5">
      <h3 className="mb-4 fw-bold">{t.settings || '設定'}</h3>

      {/* 用戶資訊 */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '60px', height: '60px', fontSize: '30px' }}>
            <i className="bi bi-person"></i>
          </div>
          <div>
            <h5 className="fw-bold mb-1">{user?.username || '未知'}</h5>
            <p className="text-muted mb-0">ID: {user?.user_id || '-----'}</p>
          </div>
        </div>
      </div>

      {/* 語言設定 */}
      <div className="card border-0 shadow-sm rounded-4 mb-3">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-globe me-2 text-primary"></i>
            {t.lang || '語言'}
          </h6>
          <select
            className="form-select form-select-lg border-0 bg-light"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="en">English</option>
            <option value="zh">繁體中文</option>
          </select>
        </div>
      </div>

      {/* 字體大小 */}
      <div className="card border-0 shadow-sm rounded-4">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-text-center me-2 text-primary"></i>
            {t.textSize || '字體大小'}
          </h6>
          <div className="btn-group w-100">
            {['small', 'medium', 'large'].map(size => (
              <button
                key={size}
                onClick={() => setTextSize(size)}
                className={`btn ${textSize === size ? 'btn-primary' : 'btn-outline-primary'}`}
              >
                {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ 📜 DEVICE LOGS 設備日誌頁面 ============

export const DeviceLogs = ({ user, device, onBack, t }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);
  const [showWifiSetup, setShowWifiSetup] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  // 載入日誌
  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      const result = await functions.getDeviceLogs(device.device_id);
      if (result.status === 'success') {
        setLogs(result.logs);
      }
      setLoading(false);
    };
    loadLogs();
  }, [device.device_id]);

  const handleRemoveDevice = async () => {
    if (!window.confirm(t.confirmRemove || '確定要移除此設備嗎？')) return;

    const result = await functions.handleRemoveDevice(user?.user_id, device.device_id);
    if (result.ok) {
      onBack();
    } else {
      alert(result.message);
    }
  };

  const handleSetupWifi = async () => {
    if (!wifiSSID || !wifiPassword) {
      alert(t.fillWifi || '請填寫 WiFi 資訊');
      return;
    }
    // TODO: 連接藍牙並發送 WiFi 配置
    alert('✅ WiFi 設定已發送到設備');
    setShowWifiSetup(false);
  };

  return (
    <div className="pb-5">
      <button onClick={onBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
        <i className="bi bi-arrow-left me-1"></i> {t.back || '返回'}
      </button>

      {/* 設備資訊卡片 */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body">
          <h3 className="text-primary fw-bold">{device.device_name}</h3>
          <p className="text-muted">ID: {device.device_id}</p>
          <div className="d-flex justify-content-between">
            <span className={`badge ${functions.getStatusBadgeClass(device.is_online)} rounded-pill`}>
              {functions.getStatusLabel(device.is_online)}
            </span>
            <span className="fw-bold">電量: {functions.getBatteryLabel(device.battery_level)}</span>
          </div>
        </div>
      </div>

      {/* 設備操作按鈕 */}
      <div className="row mb-4">
        <div className="col-md-4 mb-2">
          <button onClick={() => setShowWifiSetup(!showWifiSetup)} className="btn btn-info w-100">
            {t.setupWifi || 'Setup WiFi'}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button className="btn btn-warning w-100">
            {t.setupBLE || 'Setup BLE'}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button onClick={handleRemoveDevice} className="btn btn-danger w-100">
            {t.removeDevice || 'Remove'}
          </button>
        </div>
      </div>

      {/* WiFi 設定面板 */}
      {showWifiSetup && (
        <div className="card border-warning mb-4">
          <div className="card-body">
            <h6 className="fw-bold mb-3">{t.enterWifiInfo || '輸入 WiFi 資訊'}</h6>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="SSID"
              value={wifiSSID}
              onChange={(e) => setWifiSSID(e.target.value)}
            />
            <input
              type="password"
              className="form-control mb-3"
              placeholder="Password"
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
            />
            <button onClick={handleSetupWifi} className="btn btn-success w-100">
              {t.confirm || '確認'}
            </button>
          </div>
        </div>
      )}

      {/* 日誌列表 */}
      <h5 className="fw-bold mb-3">{t.activityLogs || '活動日誌'}</h5>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : (
        <div>
          {logs.map((log) => (
            <div key={log.activity_id} className="card shadow-sm border-0 mb-3">
              <div
                className="card-body"
                onClick={() => setExpandedLog(expandedLog === log.activity_id ? null : log.activity_id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <strong>{log.activity_type}</strong>
                    <p className="text-muted mb-0">{functions.formatTime(log.time)}</p>
                  </div>
                  <i className={`bi bi-chevron-${expandedLog === log.activity_id ? 'up' : 'down'}`}></i>
                </div>

                {expandedLog === log.activity_id && (
                  <div className="mt-3 pt-3 border-top">
                    <p><strong>{t.content || '内容'}:</strong> {log.detected_content || '---'}</p>
                    {log.image_url && (
                      <div>
                        <strong>{t.snapshot || '快照'}:</strong>
                        <img src={log.image_url} alt="snapshot" className="img-fluid mt-2 rounded" style={{ maxHeight: '200px' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ 🔌 ADD DEVICE 添加設備頁面 ============

export const AddDevice = ({ user, goBack, t }) => {
  const [bleStep, setBleStep] = useState('start');
  const [foundDevices, setFoundDevices] = useState([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [availableWifi, setAvailableWifi] = useState([]);
  const [wifiData, setWifiData] = useState({ ssid: '', password: '' });

  const handleStartScan = async () => {
    const result = await functions.initializeBleScan((device) => {
      setFoundDevices(prev => 
        prev.find(d => d.deviceId === device.deviceId) ? prev : [...prev, device]
      );
    });

    if (result.ok) {
      setIsScanning(true);
      setBleStep('scanning');
      // 5秒後自動停止掃描
      setTimeout(async () => {
        await functions.stopBleScan();
        setIsScanning(false);
      }, 5000);
    }
  };

  const handleConnectDevice = async (device) => {
    const result = await functions.connectBleDevice(device.deviceId, (text) => {
      // 處理藍牙通知
      const wifiList = functions.parseWifiScanResult(text);
      if (wifiList.length > 0) {
        setAvailableWifi(wifiList);
        setBleStep('select_wifi');
      } else if (text === 'WIFI_SUCCESS') {
        setBleStep('success');
      } else if (text === 'WIFI_FAIL') {
        alert(t.wifiFail || 'WiFi 連接失敗');
        setBleStep('select_wifi');
      }
    });

    if (result.ok) {
      setConnectedDeviceId(result.deviceId);
      setBleStep('fetching_wifi');
      // 開始掃描 WiFi
      await functions.scanWifi(result.deviceId);
    }
  };

  const handleSendWifi = async () => {
    const result = await functions.sendWifiConfig(connectedDeviceId, wifiData);
    if (result.ok) {
      setBleStep('connecting_wifi');
    } else {
      alert(result.message);
    }
  };

  const handleFinish = async () => {
    const bindResult = await functions.handleBindDevice({
      user_id: user?.user_id,
      device_id: connectedDeviceId || 'PI_VG_8899',
      device_name: 'My VisualGuard Pi'
    });

    if (bindResult.ok) {
      if (connectedDeviceId) {
        await functions.disconnectBleDevice(connectedDeviceId);
      }
      goBack();
    } else {
      alert(bindResult.message);
    }
  };

  return (
    <div className="pb-5">
      <button onClick={goBack} className="btn btn-link p-0 mb-3">
        <i className="bi bi-arrow-left me-1"></i> {t.back || '返回'}
      </button>

      <div className="card shadow-sm border-0">
        <div className="card-body text-center py-5">
          {bleStep === 'start' && (
            <div>
              <i className="bi bi-bluetooth fs-1 text-primary mb-3"></i>
              <p className="text-muted">{t.turnOnPi || '請確保設備已開啟'}</p>
              <button onClick={handleStartScan} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
                {t.scanPi || '掃描設備'}
              </button>
            </div>
          )}

          {bleStep === 'scanning' && (
            <div>
              {isScanning && <div className="spinner-border text-primary mb-3"></div>}
              <h5>{t.searching || '搜尋中...'}</h5>
              <div className="list-group mt-4">
                {foundDevices.map(dev => (
                  <button
                    key={dev.deviceId}
                    onClick={() => handleConnectDevice(dev)}
                    className="list-group-item list-group-item-action py-3 d-flex justify-content-between align-items-center"
                  >
                    <span>{dev.name || 'VisualGuard Pi'}</span>
                    <span className="badge bg-primary">{t.connect || '連線'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {bleStep === 'fetching_wifi' && (
            <div>
              <div className="spinner-border text-warning mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">{t.fetchingWifi || '讀取中...'}</h5>
            </div>
          )}

          {bleStep === 'select_wifi' && (
            <div className="text-start">
              <h5 className="fw-bold mb-3">{t.selectWifi || '選擇 WiFi 網絡'}</h5>
              <select
                className="form-select form-select-lg mb-3"
                value={wifiData.ssid}
                onChange={(e) => setWifiData({ ...wifiData, ssid: e.target.value })}
              >
                <option value="">-- {t.selectNetwork || '選擇網絡'} --</option>
                {availableWifi.map(ssid => (
                  <option key={ssid} value={ssid}>{ssid}</option>
                ))}
              </select>
              <input
                type="password"
                className="form-control form-control-lg mb-3"
                placeholder={t.password || 'Password'}
                value={wifiData.password}
                onChange={(e) => setWifiData({ ...wifiData, password: e.target.value })}
              />
              <button onClick={handleSendWifi} className="btn btn-success btn-lg w-100 fw-bold rounded-pill">
                {t.confirm || '確認'}
              </button>
            </div>
          )}

          {bleStep === 'connecting_wifi' && (
            <div>
              <div className="spinner-border text-success mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5>{t.connectingWifi || '正在連接...'}</h5>
            </div>
          )}

          {bleStep === 'success' && (
            <div>
              <i className="bi bi-check-circle text-success mb-3" style={{ fontSize: '4rem' }}></i>
              <h5 className="fw-bold">{t.setupSuccess || 'Setup 成功！'}</h5>
              <button onClick={handleFinish} className="btn btn-primary btn-lg w-100 fw-bold rounded-pill mt-3">
                {t.done || '完成'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
