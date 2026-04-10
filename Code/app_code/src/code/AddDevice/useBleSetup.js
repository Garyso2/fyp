import { useState, useEffect } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';

const VG_SERVICE_UUID = 'a07498ca-ad5b-474e-940d-16f1fbe7e8cd';
const VG_CHAR_UUID = '51ff12cb-fdf0-4222-800f-b91f37d3d224';

export const useBleSetup = (t, goBack) => {
  // --- 狀態管理 ---
  const [bleStep, setBleStep] = useState('start');
  const [foundDevices, setFoundDevices] = useState([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [availableWifi, setAvailableWifi] = useState([]);
  const [wifiData, setWifiData] = useState({ ssid: '', password: '' });

  // --- 生命週期：離開頁面自動清理 ---
  useEffect(() => {
    return () => {
      if (isScanning) {
        BleClient.stopLEScan().catch(console.error);
      }
      if (connectedDeviceId) {
         const data = new TextEncoder().encode("CANCEL_SETUP");
         BleClient.write(connectedDeviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data)
           .catch(() => {})
           .finally(() => BleClient.disconnect(connectedDeviceId).catch(() => {}));
      }
    };
  }, [isScanning, connectedDeviceId]);

  // --- 藍牙操作功能 ---
  const startScan = async () => {
    try {
      setFoundDevices([]); setBleStep('scanning'); setIsScanning(true);
      await BleClient.initialize();
      await BleClient.requestLEScan({ services: [VG_SERVICE_UUID] }, (result) => {
        setFoundDevices((prev) => prev.find(dev => dev.deviceId === result.device.deviceId) ? prev : [...prev, result.device]);
      });
      setTimeout(async () => {
        if(isScanning) { await BleClient.stopLEScan(); setIsScanning(false); }
      }, 5000);
    } catch (error) { 
      alert(t.btError); setBleStep('start'); 
    }
  };

  const connectToDevice = async (device) => {
    try {
      try { await BleClient.disconnect(device.deviceId); } catch (e) { /* 防呆清理 */ }

      await BleClient.connect(device.deviceId, () => console.log("設備已斷線"));
      setConnectedDeviceId(device.deviceId);
      
      await BleClient.startNotifications(device.deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, (value) => {
        const text = new TextDecoder().decode(value.buffer);
        
        if (text.includes('"ssids"')) {
          try {
            const data = JSON.parse(text);
            setAvailableWifi(data.ssids);
            setBleStep((currentStep) => (currentStep === 'fetching_wifi' || currentStep === 'select_wifi' ? 'select_wifi' : currentStep));
            setWifiData((prev) => ({ ...prev, ssid: prev.ssid || (data.ssids.length > 0 ? data.ssids[0] : '') }));
          } catch (e) { console.error(e); }
        } 
        else if (text === "WIFI_SUCCESS") setBleStep('success');
        else if (text === "WIFI_TIMEOUT") {
          alert(t.wifiTimeout || "Connection Timeout! Returning to home.");
          disconnectDevice();
        } 
        else if (text === "WIFI_FAIL") {
          alert(t.connFail); setBleStep('select_wifi');
        }
      });
      
      setBleStep('fetching_wifi');
      await BleClient.write(device.deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, new TextEncoder().encode("SCAN_WIFI"));
    } catch (error) { alert(t.connFail); }
  };

  const sendWifiConfig = async () => {
    if (!wifiData.ssid || !wifiData.password) return alert(t.pwdReq);
    setBleStep('connecting_wifi');
    try {
      const data = new TextEncoder().encode(JSON.stringify(wifiData));
      await BleClient.write(connectedDeviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);
    } catch (error) { alert(t.sendFail); setBleStep('select_wifi'); }
  };

  const disconnectDevice = async () => {
    try { 
      if (connectedDeviceId) {
        await BleClient.write(connectedDeviceId, VG_SERVICE_UUID, VG_CHAR_UUID, new TextEncoder().encode("CANCEL_SETUP")).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100)); 
        await BleClient.disconnect(connectedDeviceId); 
      }
    } catch (e) { console.error(e); }
    goBack(); 
  };

  // 📦 將所有需要的變數同 Function 打包回傳俾 UI
  return {
    bleStep, foundDevices, connectedDeviceId, isScanning, availableWifi, wifiData, setWifiData,
    startScan, connectToDevice, sendWifiConfig, disconnectDevice
  };
};