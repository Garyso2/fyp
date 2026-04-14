// ================== 📊 Dashboard Page ==================

import React, { useState, useEffect } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { i18n } from '../i18n';
import { DeviceService } from '../functions/device.functions';
import { UserService } from '../functions/user.functions';

export const DashboardPage = ({ user, onLogout, onSelectDevice, lang, setLang, textSize, setTextSize }) => {
  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [selectedTab, setSelectedTab] = useState('devices');

  // Use translations from i18n.js
  const t = i18n[lang] || i18n.en;

  // Load device list
  useEffect(() => {
    const loadDevices = async () => {
      if (!user?.user_id) return;

      setIsLoadingDevices(true);
      const result = await DeviceService.getUserDevices(user.user_id);
      if (result.ok) {
        setDevices(result.devices);
      }
      setIsLoadingDevices(false);
    };

    if (selectedTab === 'devices') {
      loadDevices();
    }
  }, [selectedTab, user?.user_id]);

  const handleSelectDevice = (device) => {
    onSelectDevice(device);
  };

  const handleLanguageChange = async (newLang) => {
    setLang(newLang);
    if (user?.user_id) {
      await UserService.updateLanguage(user.user_id, newLang);
    }
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      
      {/* Tab buttons */}
      <div className="bg-white border-bottom p-3 sticky-top" style={{ top: '60px' }}>
        <div className="btn-group" role="group">
          <button
            type="button"
            className={`btn ${selectedTab === 'devices' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSelectedTab('devices')}
          >
            <i className="bi bi-phone me-2"></i> {t.devices}
          </button>
          <button
            type="button"
            className={`btn ${selectedTab === 'settings' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSelectedTab('settings')}
          >
            <i className="bi bi-gear me-2"></i> {t.settings}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-grow-1 overflow-auto p-4">
        {selectedTab === 'devices' && (
          <div>
            <h3 className="mb-4 fw-bold">{t.devices}</h3>
            {isLoadingDevices ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"></div>
                <p className="text-muted mt-2">{t.loading}</p>
              </div>
            ) : (
              <div className="row">
                {devices.map(device => (
                  <div key={device.device_id} className="col-md-6 col-lg-4 mb-4">
                    <div
                      className="card shadow-sm border-0 cursor-pointer h-100"
                      onClick={() => handleSelectDevice(device)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="card-body">
                        <h5 className="card-title fw-bold">{device.device_name}</h5>
                        <p className="card-text text-muted text-truncate" title={device.device_id}>{device.device_id}</p>
                        <div className="d-flex justify-content-between align-items-center">
                          <span className={`badge ${device.is_online ? 'bg-success' : 'bg-danger'} rounded-pill`}>
                            {device.is_online ? t.online : t.offline}
                          </span>
                          <span className="fw-bold">{device.battery_level === '--' ? '---' : `${device.battery_level}%`}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => handleSelectDevice(null)}
              className="btn btn-primary rounded-circle position-fixed"
              style={{ bottom: '30px', right: '30px', width: '60px', height: '60px', fontSize: '24px' }}
            >
              <i className="bi bi-plus"></i>
            </button>
          </div>
        )}

        {selectedTab === 'settings' && (
          <div className="pb-5">
            <h3 className="mb-4 fw-bold">{t.settings}</h3>

            {/* User Info Card */}
            <div className="card border-0 shadow-sm rounded-4 mb-4">
              <div className="card-body p-4 d-flex align-items-center">
                <div className="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '60px', height: '60px', fontSize: '30px' }}>
                  <i className="bi bi-person"></i>
                </div>
                <div>
                  <h5 className="fw-bold mb-1">{user?.username || 'Unknown'}</h5>
                  <p className="text-muted mb-0">ID: {user?.user_id || '-----'}</p>
                </div>
              </div>
            </div>

            {/* Language Setting */}
            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body p-4">
                <h6 className="fw-bold mb-3">
                  <i className="bi bi-globe me-2 text-primary"></i>
                  {t.lang}
                </h6>
                <select
                  className="form-select form-select-lg border-0 bg-light"
                  value={lang}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="zh">繁體中文</option>
                </select>
              </div>
            </div>

            {/* Text Size */}
            <div className="card border-0 shadow-sm rounded-4">
              <div className="card-body p-4">
                <h6 className="fw-bold mb-3">
                  <i className="bi bi-text-center me-2 text-primary"></i>
                  {t.textSize}
                </h6>
                <div className="btn-group w-100">
                  {[
                    { value: 'small', label: t.small },
                    { value: 'medium', label: t.medium },
                    { value: 'large', label: t.large }
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setTextSize(value)}
                      className={`btn ${textSize === value ? 'btn-primary' : 'btn-outline-primary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
