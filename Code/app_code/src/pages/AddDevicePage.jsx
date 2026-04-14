// ================== 🔌 Add Device Page ==================

import React from 'react';
import { i18n } from '../i18n';
import { DeviceService } from '../functions/device.functions';
import { useBleSetup } from '../code/AddDevice/useBleSetup';

export const AddDevicePage = ({ user, goBack, lang }) => {
  const t = i18n[lang] || i18n.en;
  const {
    bleStep, foundDevices, connectedDeviceId, isScanning, availableWifi, wifiData, setWifiData,
    startScan, connectToDevice, sendWifiConfig, disconnectDevice
  } = useBleSetup(t, goBack);

  // Complete setup and bind device
  const handleFinish = async () => {
    const bindResult = await DeviceService.bindDevice(
      user?.user_id,
      connectedDeviceId || 'PI_001',
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
      <button onClick={() => disconnectDevice()} className="btn btn-link p-0 mb-3">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

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
    </div>
  );
};
