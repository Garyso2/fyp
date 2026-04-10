// ================== 🔌 添加設備頁面 ==================

import React, { useState, useEffect } from 'react';
import { i18n } from '../i18n';
import { BleService } from '../functions/ble.functions';
import { DeviceService } from '../functions/device.functions';

export const AddDevicePage = ({ user, goBack, lang }) => {
  const [bleStep, setBleStep] = useState('start');
  const [foundDevices, setFoundDevices] = useState([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [availableWifi, setAvailableWifi] = useState([]);
  const [wifiData, setWifiData] = useState({ ssid: '', password: '' });

  // 使用 i18n.js 的翻譯
  const t = i18n[lang] || i18n.en;

  // 開始掃描
  const handleStartScan = async () => {
    setFoundDevices([]);
    setIsScanning(true);

    const result = await BleService.startScan((device) => {
      setFoundDevices(prev =>
        prev.find(d => d.deviceId === device.deviceId) ? prev : [...prev, device]
      );
    });

    if (result.ok) {
      // 5秒後自動停止掃描
      setTimeout(async () => {
        await BleService.stopScan();
        setIsScanning(false);
      }, 5000);
    }
  };

  // 連接到設備
  const handleConnectDevice = async (device) => {
    const result = await BleService.connectDevice(device.deviceId, (messageText) => {
      const parsed = BleService.parseDeviceMessage(messageText);

      if (parsed.type === 'wifi_list') {
        setAvailableWifi(parsed.data);
        setBleStep('select_wifi');
      } else if (parsed.type === 'wifi_success') {
        setBleStep('success');
      } else if (parsed.type === 'wifi_fail') {
        alert(t.wifiFail);
        setBleStep('select_wifi');
      } else if (parsed.type === 'wifi_timeout') {
        alert(t.fetchingError);
        setBleStep('start');
      }
    });

    if (result.ok) {
      setConnectedDeviceId(result.deviceId);
      setBleStep('fetching_wifi');

      // 要求設備掃描 WiFi
      await BleService.scanWifi(result.deviceId);
    } else {
      alert(result.message);
    }
  };

  // 發送 WiFi 配置
  const handleSendWifi = async () => {
    if (!wifiData.ssid || !wifiData.password) {
      alert('請填寫完整 WiFi 資訊');
      return;
    }

    const result = await BleService.sendWifiConfig(
      connectedDeviceId,
      wifiData.ssid,
      wifiData.password
    );

    if (result.ok) {
      setBleStep('connecting_wifi');
    } else {
      alert(result.message);
    }
  };

  // 完成設置並綁定設備
  const handleFinish = async () => {
    const bindResult = await DeviceService.bindDevice(
      user?.user_id,
      connectedDeviceId || 'PI_VG_8899',
      'My VisualGuard Pi'
    );

    if (bindResult.ok) {
      if (connectedDeviceId) {
        await BleService.disconnectDevice(connectedDeviceId);
      }
      goBack();
    } else {
      alert(bindResult.message);
    }
  };

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button onClick={goBack} className="btn btn-link p-0 mb-3">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      <div className="card shadow-sm border-0">
        <div className="card-body text-center py-5">
          {bleStep === 'start' && (
            <div>
              <i className="bi bi-bluetooth fs-1 text-primary mb-3"></i>
              <p className="text-muted">{t.turnOnPi}</p>
              <button onClick={handleStartScan} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
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
                    onClick={() => handleConnectDevice(dev)}
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
              <button onClick={handleSendWifi} className="btn btn-success btn-lg w-100 fw-bold rounded-pill">
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
