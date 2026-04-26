import { useState, useEffect, useRef } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BLE_SERVICE_UUID, BLE_CHAR_UUID } from '../constants';

export const useBleSetup = (t, goBack) => {
  // --- 狀態管理 ---
  const [bleStep, setBleStep] = useState('start');
  const [foundDevices, setFoundDevices] = useState([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [availableWifi, setAvailableWifi] = useState([]);
  const [wifiData, setWifiData] = useState({ ssid: '', password: '' });

  // ★ Use refs instead of state for BLE callbacks to avoid stale closures
  const bufferRef = useRef('');       // accumulates fragmented BLE packets
  const modeRef = useRef('wifi_scan'); // 'wifi_scan' | 'wifi_connect' — controls how notifications are routed
  const connIdRef = useRef(null);     // mirrors connectedDeviceId for use inside callbacks
  const serviceUuidRef = useRef(BLE_SERVICE_UUID);
  const charUuidRef = useRef(BLE_CHAR_UUID);
  const isScanningRef = useRef(false); // ref copy of isScanning for use in cleanup (avoids stale closure)
  const isConnectingRef = useRef(false); // guard against multiple concurrent connectToDevice calls

  // Keep isScanningRef in sync with isScanning state
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);

  // --- 生命週期：離開頁面自動清理 (empty deps = only fires on unmount) ---
  // Uses refs instead of state to avoid stale closure bug:
  // Previously [isScanning, connectedDeviceId] caused cleanup to fire when the
  // 5-second scan timeout flipped isScanning→false while connectedDeviceId was
  // already set, sending an unintended CANCEL_SETUP to the Pi mid-connection.
  useEffect(() => {
    return () => {
      if (isScanningRef.current) {
        BleClient.stopLEScan().catch(console.error);
      }
      if (connIdRef.current) {
         const data = new TextEncoder().encode("CANCEL_SETUP");
         BleClient.write(connIdRef.current, BLE_SERVICE_UUID, BLE_CHAR_UUID, data)
           .catch(() => {})
           .finally(() => BleClient.disconnect(connIdRef.current).catch(() => {}));
      }
    };
  }, []);  // ← empty: only runs when component unmounts (user navigates away)

  // --- 藍牙操作功能 ---
  const startScan = async () => {
    // Guard: ignore if already scanning
    if (isScanningRef.current) {
      console.log('⚠️ 已在掃描中，忽略重複呼叫');
      return;
    }
    try {
      setFoundDevices([]);
      setBleStep('scanning');
      setIsScanning(true);
      
      await BleClient.initialize();
      console.log('✅ BLE 已初始化');
      
      await BleClient.requestLEScan({ services: [BLE_SERVICE_UUID] }, (result) => {
        console.log('📱 找到設備:', result.device.name, result.device.deviceId);
        setFoundDevices((prev) => 
          prev.find(dev => dev.deviceId === result.device.deviceId) ? prev : [...prev, result.device]
        );
      });
      
      // 5秒後自動停止掃描 (使用新的狀態變數避免閉包問題)
      setTimeout(async () => {
        setIsScanning((prevScanning) => {
          if (prevScanning) {
            BleClient.stopLEScan().catch(err => console.error('停止掃描失敗:', err));
          }
          return false;
        });
      }, 5000);
    } catch (error) {
      console.error('❌ 掃描失敗:', error);
      alert(t.btError);
      setBleStep('start');
    }
  };

  const connectToDevice = async (device) => {
    // Guard: prevent multiple concurrent connection attempts (e.g. rapid taps)
    if (isConnectingRef.current) {
      console.log('⚠️ 已在連接中，忽略重複呼叫');
      return;
    }
    isConnectingRef.current = true;
    try {
      console.log('🔌 開始連接設備:', device.deviceId, device.name);
      
      // Clean up any stale connection first
      try {
        await BleClient.disconnect(device.deviceId);
        console.log('✅ 舊連接已清理');
      } catch (e) {
        console.log('ℹ️ 無舊連接，跳過清理');
      }

      console.log('📡 正在連接 (iOS 可能需要配對確認)...');
      await BleClient.connect(
        device.deviceId,
        () => {
          // Unexpected disconnect — reset all connection state so cleanup
          // doesn't try to write/disconnect a device that's already gone.
          console.log('⚠️  設備已斷線');
          connIdRef.current = null;
          isConnectingRef.current = false;
          setBleStep('start');
        },
        { timeout: 30000 }
      );
      console.log('✅ 已連接到設備');

      connIdRef.current = device.deviceId;
      setConnectedDeviceId(device.deviceId);

      // Wait for pairing to stabilise
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Discover services and pick the best characteristic
      let serviceUuid = BLE_SERVICE_UUID;
      let charUuid = BLE_CHAR_UUID;
      try {
        const services = await BleClient.getServices(device.deviceId);
        console.log('📋 發現的服務:', services.length);
        // Use labelled break to exit BOTH loops once the correct characteristic is found.
        // Without this, the inner break only exits the char loop and the outer loop
        // continues, potentially overwriting serviceUuid/charUuid with a wrong service.
        outerLoop: for (const service of services) {
          for (const char of (service.characteristics || [])) {
            if (char.properties?.write && (char.properties?.notify || char.properties?.indicate)) {
              serviceUuid = service.uuid;
              charUuid = char.uuid;
              console.log(`✅ 找到合適的特徵: ${charUuid} (service: ${serviceUuid})`);
              break outerLoop;
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ 無法獲取服務，使用預設 UUID:', e.message);
      }
      serviceUuidRef.current = serviceUuid;
      charUuidRef.current = charUuid;

      // ★ Set up ONE notification subscription for the entire session.
      //   modeRef controls how incoming messages are routed.
      bufferRef.current = '';
      modeRef.current = 'wifi_scan';

      console.log('🔔 啟動通知監聽 (UUID:', charUuid, ')...');
      await BleClient.startNotifications(
        device.deviceId,
        serviceUuid,
        charUuid,
        (value) => {
          try {
            if (!value?.buffer) { console.warn('⚠️ 收到空值'); return; }

            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 訊息片段:', text.substring(0, 120));
            bufferRef.current += text;

            // ── Try to extract a complete JSON object ──────────────────
            if (bufferRef.current.includes('{')) {
              const start = bufferRef.current.indexOf('{');
              const end   = bufferRef.current.lastIndexOf('}');
              if (end > start) {
                const candidate = bufferRef.current.substring(start, end + 1);
                try {
                  const json = JSON.parse(candidate);
                  bufferRef.current = '';
                  console.log('✅ 完整 JSON 已解析:', JSON.stringify(json).substring(0, 100));
                  handleParsedMessage(json, null);
                  return;
                } catch (_) {
                  // Not yet complete — keep buffering
                  return;
                }
              } else {
                // Opening brace seen but no closing yet — keep buffering
                return;
              }
            }

            // ── Plain-text message (no JSON braces) ───────────────────
            const plain = bufferRef.current.trim();
            if (plain) {
              bufferRef.current = '';
              handleParsedMessage(null, plain);
            }
          } catch (e) {
            console.error('❌ 解碼訊息失敗:', e);
          }
        }
      );

      console.log('✅ 通知監聽已啟動');
      setBleStep('fetching_wifi');

      // Tell Pi to scan WiFi
      console.log('📤 發送 SCAN_WIFI 指令...');
      await BleClient.write(
        device.deviceId,
        serviceUuid,
        charUuid,
        new TextEncoder().encode('SCAN_WIFI'),
        { timeout: 30000 }
      );
      console.log('✅ 指令已發送，等待 WiFi 列表...');
    } catch (error) {
      console.error('❌ 連接失敗:', error);
      alert(`❌ 連接失敗\n\n詳情: ${error.message}\n\n提示: 檢查 Pi 端 BLE 服務是否運行`);
      setBleStep('scanning');
    } finally {
      isConnectingRef.current = false;
    }
  };

  /**
   * ★ Unified message router — called by the single BLE notification handler.
   *   modeRef.current determines which phase we are in.
   */
  const handleParsedMessage = (json, plainText) => {
    const status = json?.status || plainText;
    console.log(`🔀 handleParsedMessage | mode=${modeRef.current} | status=${status}`);

    if (modeRef.current === 'wifi_scan') {
      // ── Phase 1: waiting for WiFi SSID list ──────────────────────────
      if (json?.ssids && Array.isArray(json.ssids)) {
        console.log('📶 WiFi 列表:', json.ssids);
        setAvailableWifi(json.ssids);
        setBleStep('select_wifi');
        setWifiData(prev => ({
          ...prev,
          ssid: prev.ssid || (json.ssids.length > 0 ? json.ssids[0] : '')
        }));
      }
      // Pi may already reply with success if WiFi was previously configured
      else if (status === 'WIFI_SUCCESS') {
        if (json?.device_id) localStorage.setItem('piDeviceId', json.device_id);
        setBleStep('success');
      }

    } else if (modeRef.current === 'wifi_connect') {
      // ── Phase 2: waiting for WiFi connection result ───────────────────
      if (status === 'WIFI_SUCCESS') {
        console.log('✅ WiFi 連接成功!');
        if (json?.device_id) {
          localStorage.setItem('piDeviceId', json.device_id);
          console.log('💾 Device ID saved:', json.device_id);
        }
        setBleStep('success');
      } else if (status === 'WIFI_TIMEOUT') {
        console.log('⏱️  WiFi 連接超時');
        alert(t.wifiTimeout || 'WiFi Connection Timeout! Please try again.');
        setBleStep('select_wifi');
      } else if (status === 'WIFI_FAIL') {
        console.log('❌ WiFi 連接失敗');
        alert(t.connFail || 'WiFi Connection Failed! Please check SSID and password.');
        setBleStep('select_wifi');
      } else {
        console.log('↩️ 忽略非結果訊息 (phase: wifi_connect):', status);
      }
    }
  };

  const sendWifiConfig = async () => {
    if (!wifiData.ssid || !wifiData.password) return alert(t.pwdReq);

    setBleStep('connecting_wifi');
    console.log('🔌 [WiFi Config] Sending WiFi credentials:', wifiData.ssid);

    try {
      // ★ Switch the notification router to wifi_connect phase — no new subscription needed
      bufferRef.current = '';
      modeRef.current = 'wifi_connect';
      console.log('🔀 Switched notification mode → wifi_connect');

      const payload = new TextEncoder().encode(JSON.stringify(wifiData));
      await BleClient.write(
        connIdRef.current,
        serviceUuidRef.current,
        charUuidRef.current,
        payload,
        { timeout: 30000 }
      );
      console.log('📡 [WiFi Config] WiFi credentials sent, waiting for result...');

      // Fallback timeout (Pi will usually respond within 30s)
      setTimeout(() => {
        if (modeRef.current === 'wifi_connect') {
          console.warn('⏱️  [WiFi Config] No response after 45s');
          alert('No response from device. Please try again.');
          setBleStep('select_wifi');
        }
      }, 45000);
    } catch (error) {
      console.error('❌ [WiFi Config] Send failed:', error);
      alert(t.sendFail || 'Failed to send WiFi config');
      setBleStep('select_wifi');
    }
  };

  const disconnectDevice = async () => {
    try {
      if (connIdRef.current) {
        await BleClient.write(connIdRef.current, serviceUuidRef.current, charUuidRef.current, new TextEncoder().encode('CANCEL_SETUP')).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100));
        await BleClient.disconnect(connIdRef.current);
      }
    } catch (e) { console.error(e); }
    bufferRef.current = '';
    modeRef.current = 'wifi_scan';
    connIdRef.current = null;
    goBack();
  };

  // 📦 將所有需要的變數同 Function 打包回傳俾 UI
  return {
    bleStep, foundDevices, connectedDeviceId, isScanning, availableWifi, wifiData, setWifiData,
    startScan, connectToDevice, sendWifiConfig, disconnectDevice
  };
};