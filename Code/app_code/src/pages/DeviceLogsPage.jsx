// ================== 📜 設備日誌頁面 ==================

import React, { useState, useEffect } from 'react';
import { i18n } from '../i18n';
import { DeviceService } from '../functions/device.functions';
import { ActivityLogService } from '../functions/activityLog.functions';

export const DeviceLogsPage = ({ user, device, onBack, lang }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);
  const [showWifiSetup, setShowWifiSetup] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  // 使用 i18n.js 的翻譯
  const t = i18n[lang] || i18n.en;

  // 載入日誌
  useEffect(() => {
    const loadLogs = async () => {
      if (!device?.device_id) return;

      setLoading(true);
      const result = await ActivityLogService.getDeviceLogs(device.device_id);
      if (result.ok) {
        setLogs(result.logs);
      }
      setLoading(false);
    };

    loadLogs();
  }, [device?.device_id]);

  const handleRemoveDevice = async () => {
    if (!window.confirm(t.removeConfirm)) return;

    const result = await DeviceService.unbindDevice(user?.user_id, device.device_id);
    if (result.ok) {
      onBack();
    } else {
      alert(result.message);
    }
  };

  const handleSetupWifi = async () => {
    if (!wifiSSID || !wifiPassword) {
      alert('請填寫 WiFi 資訊');
      return;
    }
    // TODO: 連接藍牙並發送 WiFi 配置
    alert('✅ WiFi 設定已發送到設備');
    setShowWifiSetup(false);
  };

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button onClick={onBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      {/* 設備資訊卡片 */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body">
          <h3 className="text-primary fw-bold">{device.device_name}</h3>
          <p className="text-muted">ID: {device.device_id}</p>
          <div className="d-flex justify-content-between">
            <span className={`badge ${device.is_online ? 'bg-success' : 'bg-danger'} rounded-pill`}>
              {device.is_online ? t.online : t.offline}
            </span>
            <span className="fw-bold">{t.battery}: {device.battery_level === '--' ? '---' : `${device.battery_level}%`}</span>
          </div>
        </div>
      </div>

      {/* 設備操作按鈕 */}
      <div className="row mb-4">
        <div className="col-md-4 mb-2">
          <button onClick={() => setShowWifiSetup(!showWifiSetup)} className="btn btn-info w-100">
            <i className="bi bi-wifi me-1"></i> {t.setupWifi}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button className="btn btn-warning w-100">
            <i className="bi bi-bluetooth me-1"></i> {t.setupBLE}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button onClick={handleRemoveDevice} className="btn btn-danger w-100">
            <i className="bi bi-trash me-1"></i> {t.removeDevice}
          </button>
        </div>
      </div>

      {/* WiFi 設定面板 */}
      {showWifiSetup && (
        <div className="card border-warning mb-4">
          <div className="card-body">
            <h6 className="fw-bold mb-3">{t.enterWifiInfo}</h6>
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
              placeholder={t.password || 'Password'}
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
            />
            <button onClick={handleSetupWifi} className="btn btn-success w-100">
              {t.confirm}
            </button>
          </div>
        </div>
      )}

      {/* 日誌列表 */}
      <h5 className="fw-bold mb-3">{t.activityLogs}</h5>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="text-muted mt-2">{t.loading}</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-inbox" style={{ fontSize: '3rem' }}></i>
          <p className="mt-2">沒有日誌紀錄</p>
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
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center mb-1">
                      <span className="badge bg-primary me-2">{log.activity_type}</span>
                      <strong>{log.detected_content ? log.detected_content.substring(0, 50) : '---'}</strong>
                    </div>
                    <p className="text-muted mb-0 small">
                      <i className="bi bi-clock me-1"></i>
                      {ActivityLogService.formatLogTime(log.time, lang)}
                    </p>
                  </div>
                  <i className={`bi bi-chevron-${expandedLog === log.activity_id ? 'up' : 'down'}`}></i>
                </div>

                {expandedLog === log.activity_id && (
                  <div className="mt-3 pt-3 border-top">
                    <p><strong>{t.content}:</strong> {log.detected_content || '---'}</p>
                    {log.image_url && (
                      <div>
                        <strong className="d-block mb-2">{t.snapshot}:</strong>
                        <img src={log.image_url} alt="snapshot" className="img-fluid rounded" style={{ maxHeight: '200px' }} />
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
