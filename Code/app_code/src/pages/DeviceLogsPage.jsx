// ================== 📜 Device Logs Page ==================

import React, { useState, useEffect, useMemo } from 'react';
import { i18n } from '../i18n';
import { DeviceService } from '../functions/device.functions';
import { ActivityLogService } from '../functions/activityLog.functions';

export const DeviceLogsPage = ({ user, device, onBack, onSetupWifi, onSetupBluetooth, lang }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);

  const [filterType, setFilterType] = useState(''); // Filter by type
  const [filterDate, setFilterDate] = useState(''); // Filter by date
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Use translations from i18n.js
  const t = i18n[lang] || i18n.en;

  // Load logs
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
    // Add user_id protection to avoid API errors
    if (!user?.user_id || !device?.device_id) {
      alert('Unable to retrieve user or device information, please try again later.');
      return;
    }

    if (!window.confirm(t.removeConfirm)) return;

    const result = await DeviceService.unbindDevice(user.user_id, device.device_id);
    if (result.ok) {
      onBack();
    } else {
      alert(result.message);
    }
  };

  const handleSetupWifi = async () => {
    // Call the parent's onSetupWifi handler to navigate to WiFi setup page
    if (onSetupWifi) {
      onSetupWifi(device);
    }
  };

  const handleSetupBluetooth = async () => {
    // Call the parent's onSetupBluetooth handler to navigate to Bluetooth setup page
    if (onSetupBluetooth) {
      onSetupBluetooth(device);
    }
  };

  // 🎯 Use useMemo to optimize filter and sort logic, avoid unnecessary recalculations
  const filteredAndSortedLogs = useMemo(() => {
    let filtered = [...logs];

    // Filter by type
    if (filterType) {
      filtered = filtered.filter(log => log.activity_type === filterType);
    }

    // Filter by date
    if (filterDate) {
      filtered = filtered.filter(log => {
        const logDate = new Date(log.time).toISOString().split('T')[0];
        return logDate === filterDate;
      });
    }

    // Sort in descending order (newest first)
    filtered.sort((a, b) => new Date(b.time) - new Date(a.time));

    return filtered;
  }, [logs, filterType, filterDate]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLogs.length / ITEMS_PER_PAGE));
  const paginatedLogs = filteredAndSortedLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // 🚨 Final protection: show loading screen if device data not loaded yet, prevent white screen crash
  if (!device) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <div className="spinner-border text-primary" role="status"></div>
        <span className="ms-3 fw-bold text-muted">Loading device data...</span>
      </div>
    );
  }

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button onClick={onBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      {/* Device Info Card */}
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

      {/* Device Control Buttons */}
      <div className="row mb-4">
        <div className="col-md-4 mb-2">
          <button onClick={handleSetupWifi} className="btn btn-info w-100">
            <i className="bi bi-wifi me-1"></i> {t.setupWifi}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button onClick={handleSetupBluetooth} className="btn btn-warning w-100">
            <i className="bi bi-bluetooth me-1"></i> {t.setupBLE}
          </button>
        </div>
        <div className="col-md-4 mb-2">
          <button onClick={handleRemoveDevice} className="btn btn-danger w-100">
            <i className="bi bi-trash me-1"></i> {t.removeDevice}
          </button>
        </div>
      </div>

      {/* Logs List */}
      <h5 className="fw-bold mb-3">{t.activityLogs}</h5>

      {/* 🎯 Filter Control Panel */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small fw-bold mb-1">Type</label>
              <select 
                className="form-select form-select-sm"
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Types</option>
                <option value="AI_CHAT">AI_CHAT</option>
                <option value="IMAGE_CAPTURE">IMAGE_CAPTURE</option>
                <option value="OBSTACLE_WARNING">OBSTACLE_WARNING</option>
                <option value="FALL_DETECTION">FALL_DETECTION</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold mb-1">Data</label>
              <input 
                type="date" 
                className="form-control form-control-sm"
                value={filterDate}
                onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>

          {/* Clear Filter Button */}
          {(filterType || filterDate) && (
            <div className="mt-2">
              <button 
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setFilterType('');
                  setFilterDate('');
                  setCurrentPage(1);
                }}
              >
                <i className="bi bi-x-circle me-1"></i> 清除篩選
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
          <p className="text-muted mt-2">{t.loading}</p>
        </div>
      ) : filteredAndSortedLogs.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-inbox" style={{ fontSize: '3rem' }}></i>
          <p className="mt-2">{filterType || filterDate ? '沒有符合條件的紀錄' : '沒有日誌紀錄'}</p>
        </div>
      ) : (
        <div>
          {paginatedLogs.map((log) => (
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

          {/* Pagination Controls */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <i className="bi bi-chevron-left me-1"></i> Previous
            </button>
            <span className="text-muted small">Page {currentPage} / {totalPages}</span>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next <i className="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};