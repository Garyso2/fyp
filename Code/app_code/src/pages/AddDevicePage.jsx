// ================== 🔌 Add Device Page ==================

import React, { useState } from 'react';
import { i18n } from '../i18n';
import { DeviceService } from '../functions/device.functions';
import { useBleSetup } from '../code/AddDevice/useBleSetup';

export const AddDevicePage = ({ user, goBack, lang }) => {
  const t = i18n[lang] || i18n.en;
  const {
    bleStep, foundDevices, connectedDeviceId, isScanning, availableWifi, wifiData, setWifiData,
    startScan, connectToDevice, sendWifiConfig, disconnectDevice
  } = useBleSetup(t, goBack);

  // 'choose' | 'ble' | 'manual'
  const [connectionMethod, setConnectionMethod] = useState('choose');

  // Manual ID method state
  const [manualDeviceId, setManualDeviceId] = useState('');
  const [manualDeviceName, setManualDeviceName] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');

  const handleManualBind = async () => {
    if (!manualDeviceId.trim()) {
      setManualError('Please enter a Device ID.');
      return;
    }
    setManualError('');
    setManualLoading(true);
    const result = await DeviceService.bindDevice(
      user?.user_id,
      manualDeviceId.trim(),
      manualDeviceName.trim() || 'My VisualGuard Pi'
    );
    setManualLoading(false);
    if (result.ok) {
      goBack();
    } else {
      setManualError(result.message || '❌ Failed to bind device.');
    }
  };

  // Complete BLE setup and bind device
  const handleFinish = async () => {
    const piDeviceId = localStorage.getItem('piDeviceId');
    if (!piDeviceId) {
      alert('❌ Device ID not received from Pi. Please restart WiFi setup.');
      return;
    }
    const bindResult = await DeviceService.bindDevice(
      user?.user_id,
      piDeviceId,
      'My VisualGuard Pi'
    );
    if (bindResult.ok) {
      if (connectedDeviceId) {
        await disconnectDevice();
      } else {
        goBack();
      }
    } else {
      alert(bindResult.message);
    }
  };

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button
        onClick={() => {
          if (connectionMethod !== 'choose') {
            setConnectionMethod('choose');
            setManualError('');
          } else {
            disconnectDevice();
          }
        }}
        className="btn btn-link p-0 mb-3"
      >
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      {/* ── Method Selection ─────────────────────────────── */}
      {connectionMethod === 'choose' && (
        <div>
          <h5 className="fw-bold mb-4 text-center">Add New Device</h5>
          <div className="row g-3">
            <div className="col-12">
              <div
                className="card shadow-sm border-0 h-100"
                style={{ cursor: 'pointer' }}
                onClick={() => setConnectionMethod('ble')}
              >
                <div className="card-body text-center py-4">
                  <i className="bi bi-bluetooth fs-1 text-primary mb-2 d-block"></i>
                  <h6 className="fw-bold">Setup via Bluetooth</h6>
                  <p className="text-muted small mb-0">Scan for a nearby VisualGuard Pi and configure its WiFi</p>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div
                className="card shadow-sm border-0 h-100"
                style={{ cursor: 'pointer' }}
                onClick={() => setConnectionMethod('manual')}
              >
                <div className="card-body text-center py-4">
                  <i className="bi bi-keyboard fs-1 text-success mb-2 d-block"></i>
                  <h6 className="fw-bold">Enter Device ID</h6>
                  <p className="text-muted small mb-0">Manually enter the Device ID printed on your VisualGuard Pi</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Device ID Form ────────────────────────── */}
      {connectionMethod === 'manual' && (
        <div className="card shadow-sm border-0">
          <div className="card-body py-4 px-4">
            <div className="text-center mb-4">
              <i className="bi bi-keyboard fs-1 text-success mb-2 d-block"></i>
              <h5 className="fw-bold">Enter Device ID</h5>
            </div>

            {manualError && <div className="alert alert-danger">{manualError}</div>}

            <div className="mb-3">
              <label className="form-label fw-bold">Device ID <span className="text-danger">*</span></label>
              <input
                type="text"
                className="form-control form-control-lg border-0 bg-light"
                placeholder="e.g. D001"
                value={manualDeviceId}
                onChange={(e) => setManualDeviceId(e.target.value)}
              />
              <div className="form-text">The Device ID is printed on your VisualGuard Pi.</div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">Device Name <span className="text-muted small fw-normal">(optional)</span></label>
              <input
                type="text"
                className="form-control form-control-lg border-0 bg-light"
                placeholder="My VisualGuard Pi"
                value={manualDeviceName}
                onChange={(e) => setManualDeviceName(e.target.value)}
              />
            </div>

            <button
              className="btn btn-success btn-lg w-100 fw-bold rounded-pill"
              onClick={handleManualBind}
              disabled={manualLoading}
            >
              {manualLoading ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Connecting...</>
              ) : (
                <><i className="bi bi-link-45deg me-2"></i>Bind Device</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── BLE Setup Flow ───────────────────────────────── */}
      {connectionMethod === 'ble' && (
        <div className="card shadow-sm border-0">
          <div className="card-body text-center py-5">
            {bleStep === 'start' && (
              <div>
                <i className="bi bi-bluetooth fs-1 text-primary mb-3"></i>
                <p className="text-muted">{t.turnOnPi}</p>
                <button onClick={startScan} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
                  {t.scanPi}
                </button>
              </div>
            )}

            {bleStep === 'scanning' && (
              <div>
                {isScanning && <div className="spinner-border text-primary mb-3"></div>}
                <h5>{t.searching}</h5>
                <div className="list-group mt-4">
                  {foundDevices.map(dev => (
                    <button
                      key={dev.deviceId}
                      onClick={() => connectToDevice(dev)}
                      className="list-group-item list-group-item-action py-3 d-flex justify-content-between align-items-center"
                    >
                      <span>{dev.name || 'VisualGuard Pi'}</span>
                      <span className="badge bg-primary">{t.connect}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bleStep === 'fetching_wifi' && (
              <div>
                <div className="spinner-border text-warning mb-3" style={{ width: '3rem', height: '3rem' }}></div>
                <h5 className="fw-bold">{t.fetchingWifi}</h5>
                <p className="text-muted">{t.fetchingWait}</p>
              </div>
            )}

            {bleStep === 'select_wifi' && (
              <div className="text-start">
                <h5 className="fw-bold mb-3">{t.selectWifi}</h5>
                <select
                  className="form-select form-select-lg mb-3"
                  value={wifiData.ssid}
                  onChange={(e) => setWifiData({ ...wifiData, ssid: e.target.value })}
                >
                  <option value="">-- {t.selectNetwork} --</option>
                  {availableWifi.map(ssid => (
                    <option key={ssid} value={ssid}>{ssid}</option>
                  ))}
                </select>
                <input
                  type="password"
                  className="form-control form-control-lg mb-3"
                  placeholder={t.password}
                  value={wifiData.password}
                  onChange={(e) => setWifiData({ ...wifiData, password: e.target.value })}
                />
                <button onClick={sendWifiConfig} className="btn btn-success btn-lg w-100 fw-bold rounded-pill">
                  {t.confirm}
                </button>
              </div>
            )}

            {bleStep === 'connecting_wifi' && (
              <div>
                <div className="spinner-border text-success mb-3" style={{ width: '3rem', height: '3rem' }}></div>
                <h5>{t.connectingWifi}</h5>
              </div>
            )}

            {bleStep === 'success' && (
              <div>
                <i className="bi bi-check-circle text-success mb-3" style={{ fontSize: '4rem' }}></i>
                <h5 className="fw-bold">{t.setupSuccess}</h5>
                <button onClick={handleFinish} className="btn btn-primary btn-lg w-100 fw-bold rounded-pill mt-3">
                  {t.done}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


