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
  
  // ★ 新增：用於處理分割的 JSON 數據
  const [incompleteData, setIncompleteData] = useState('');

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
      setFoundDevices([]);
      setBleStep('scanning');
      setIsScanning(true);
      
      await BleClient.initialize();
      console.log('✅ BLE 已初始化');
      
      await BleClient.requestLEScan({ services: [VG_SERVICE_UUID] }, (result) => {
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
    try {
      console.log('🔌 開始連接設備:', device.deviceId, device.name);
      
      // 防呆：先嘗試清理舊連接
      try {
        await BleClient.disconnect(device.deviceId);
        console.log('✅ 舊連接已清理');
      } catch (e) {
        console.log('ℹ️ 無舊連接，跳過清理');
      }

      // ⚠️ iOS 蓝牙配对可能需要用户确认，允许足够的时间
      console.log('📡 正在連接 (iOS 可能需要配對確認)...');
      
      await BleClient.connect(
        device.deviceId, 
        () => {
          console.log("⚠️  設備已斷線");
          setBleStep('start');
        },
        { timeout: 30000 }
      );
      console.log('✅ 已連接到設備');
      
      setConnectedDeviceId(device.deviceId);
      
      // 等待 1-2 秒让配对完全进行
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 🔍 動態獲取設備的服務和特徵
      console.log('🔍 正在獲取設備服務和特徵...');
      let serviceUuid = VG_SERVICE_UUID;
      let charUuid = VG_CHAR_UUID;
      
      try {
        const services = await BleClient.getServices(device.deviceId);
        console.log('📋 發現的服務:', services.length);
        
        if (services && services.length > 0) {
          services.forEach((service, idx) => {
            console.log(`  [服務 ${idx}] ${service.uuid}`);
            if (service.characteristics) {
              service.characteristics.forEach((char, charIdx) => {
                console.log(`    [特徵 ${charIdx}] ${char.uuid} - Props: ${JSON.stringify(char.properties)}`);
              });
            }
          });
          
          // 尋找有 write 和 notify 的特徵
          for (const service of services) {
            if (service.characteristics) {
              for (const char of service.characteristics) {
                if (char.properties && 
                    char.properties.write && 
                    (char.properties.notify || char.properties.indicate)) {
                  serviceUuid = service.uuid;
                  charUuid = char.uuid;
                  console.log(`✅ 找到合適的特徵: ${charUuid}`);
                  break;
                }
              }
            }
          }
        }
      } catch (getServicesError) {
        console.error('⚠️ 無法獲取服務，使用預設 UUID:', getServicesError.message);
      }
      
      // 啟動通知監聽
      console.log('🔔 啟動通知監聽 (UUID:', charUuid, ')...');
      await BleClient.startNotifications(
        device.deviceId,
        serviceUuid,
        charUuid,
        (value) => {
          // 🛠️ 修復點：加入漏掉的 try 區塊
          try {
            if (!value || !value.buffer) {
              console.warn('⚠️ 收到的値為 null 或無效');
              return;
            }
            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 訊息片段:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
              
            // ★ 處理可能被分割的 JSON 數據
            let fullMessage = incompleteData + text;
            
            // 檢查是否是完整的 JSON (以 } 結尾)
            if (fullMessage.includes('{') && fullMessage.includes('}')) {
              const jsonMatch = fullMessage.match(/\{.*\}/);
              if (jsonMatch) {
                try {
                  const jsonEnd = fullMessage.lastIndexOf('}');
                  const completeJson = fullMessage.substring(fullMessage.indexOf('{'), jsonEnd + 1);
                  const data = JSON.parse(completeJson);
                  
                  console.log('✅ 完整 JSON 已解析', data);
                  setIncompleteData(''); // 清除暫存
                  
                  if (data.ssids && Array.isArray(data.ssids)) {
                    console.log('📶 WiFi 列表:', data.ssids);
                    setAvailableWifi(data.ssids);
                    setBleStep('select_wifi');
                    setWifiData((prev) => ({ 
                      ...prev, 
                      ssid: prev.ssid || (data.ssids.length > 0 ? data.ssids[0] : '') 
                    }));
                  }
                  return;
                } catch (parseError) {
                  console.warn('⚠️ JSON 解析失敗，保存暫存數據:', parseError.message);
                  setIncompleteData(fullMessage);
                  return;
                }
              } else {
                setIncompleteData(fullMessage);
                return;
              }
            } else {
              // 還不是完整 JSON，保存暫存
              setIncompleteData(fullMessage);
              console.log('⏳ 等待更多數據... (目前長度: ' + fullMessage.length + ')');
              return;
            }
            
            // 處理其他非 JSON 訊息
            console.log('📨 完整訊息:', text);
            if (text === "WIFI_SUCCESS") {
              console.log('✅ WiFi 連接成功');
              setBleStep('success');
            } else if (text === "WIFI_TIMEOUT") {
              console.log('⏱️  WiFi 連接超時');
              alert(t.wifiTimeout || "WiFi Connection Timeout!");
              disconnectDevice();
            } else if (text === "WIFI_FAIL") {
              console.log('❌ WiFi 連接失敗 (密碼可能錯誤)');
              alert(t.connFail || "WiFi Connection Failed! Please check password.");
              setBleStep('select_wifi');
            }
          } catch (decodeError) {
            console.error('❌ 解碼訊息失敗:', decodeError);
          }
        },
        { timeout: 30000 }
      );
      
      console.log('✅ 通知監聽已啟動');
      setBleStep('fetching_wifi');
      
      // 發送掃描 WiFi 指令
      console.log('📤 發送 SCAN_WIFI 指令 (UUID:', charUuid, ')...');
      await BleClient.write(
        device.deviceId,
        serviceUuid,
        charUuid,
        new TextEncoder().encode("SCAN_WIFI"),
        { timeout: 30000 }
      );
      console.log('✅ 指令已發送，等待 WiFi 列表...');
    } catch (error) {
      console.error('❌ 連接失敗:', error);
      console.error('錯誤詳情:', error.message);
      console.error('錯誤堆棧:', error.stack);
      alert(`❌ 連接失敗\n\n詳情: ${error.message}\n\n提示: 檢查 Pi 端 BLE 服務是否運行`);
      setBleStep('scanning');
    }
  };

  const sendWifiConfig = async () => {
    if (!wifiData.ssid || !wifiData.password) return alert(t.pwdReq);
    
    setBleStep('connecting_wifi');
    console.log('🔌 [WiFi Config] Sending WiFi credentials:', wifiData.ssid);
    
    try {
      // 🔴 CRITICAL: Start listening for WiFi connection result FIRST
      console.log('🎧 [WiFi Config] Starting listener for connection result...');
      let connectionResultReceived = false;
      let timeoutHandle = null;
      let incompleteMsgBuffer = ''; // Handle message fragmentation
      
      await BleClient.startNotifications(
        connectedDeviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          try {
            if (!value || !value.buffer) return;
            
            const text = new TextDecoder().decode(value.buffer).trim();
            console.log('📨 [WiFi Config] Raw message:', text);
            
            // 🔴 CRITICAL: Handle message fragmentation (JSON might be split across multiple BLE packets)
            incompleteMsgBuffer += text;
            console.log('📦 [WiFi Config] Buffer length:', incompleteMsgBuffer.length);
            
            // Try to parse as JSON
            let status = null;
            let respDeviceId = null;
            
            try {
              // Try to find complete JSON object
              const jsonMatch = incompleteMsgBuffer.match(/\{.*\}/);
              if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0]);
                status = jsonData.status;
                respDeviceId = jsonData.device_id; // 🔴 Extract device ID from Pi
                
                if (respDeviceId) {
                  console.log('📱 [WiFi Config] Device ID received from Pi:', respDeviceId);
                  // Store device ID in localStorage for later binding
                  localStorage.setItem('piDeviceId', respDeviceId);
                  console.log('💾 [WiFi Config] Device ID saved to localStorage');
                }
                incompleteMsgBuffer = ''; // Reset buffer after successful parse
              } else {
                console.log('⏳ [WiFi Config] Waiting for complete JSON...');
                return;
              }
            } catch (parseError) {
              console.log('⏳ [WiFi Config] JSON parse pending, buffer:', incompleteMsgBuffer.substring(0, 50));
              return;
            }
            
            // Only respond to connection result messages, not WiFi list
            if (status === 'WIFI_SUCCESS' || text.includes('WIFI_SUCCESS')) {
              console.log('✅ [WiFi Config] WiFi connection successful!');
              connectionResultReceived = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              setBleStep('success');
              
            } else if (status === 'WIFI_TIMEOUT' || text.includes('WIFI_TIMEOUT')) {
              console.log('⏱️  [WiFi Config] WiFi connection timeout');
              connectionResultReceived = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              alert(t.wifiTimeout || "WiFi Connection Timeout! Please try again.");
              setBleStep('select_wifi');
              
            } else if (status === 'WIFI_FAIL' || text.includes('WIFI_FAIL')) {
              console.log('❌ [WiFi Config] WiFi connection failed');
              connectionResultReceived = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              alert(t.connFail || "WiFi Connection Failed! Please check SSID and password.");
              setBleStep('select_wifi');
              
            } else {
              // Ignore other messages (like WiFi list)
              console.log('↩️️ [WiFi Config] Ignoring non-result message:', text);
            }
          } catch (error) {
            console.error('❌ [WiFi Config] Error processing result:', error);
          }
        },
        { timeout: 30000 }
      );

      console.log('✅ [WiFi Config] Listener started, now sending credentials...');

      // Send WiFi credentials
      const data = new TextEncoder().encode(JSON.stringify(wifiData));
      await BleClient.write(connectedDeviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);
      console.log('📡 [WiFi Config] WiFi credentials sent');

      // Set timeout for response
      timeoutHandle = setTimeout(() => {
        if (!connectionResultReceived) {
          console.log('⏱️  [WiFi Config] No response from device (45s timeout)');
          alert('No response from device. Connection timeout.');
          setBleStep('select_wifi');
        }
      }, 45000);  // 45 second timeout
      
    } catch (error) {
      console.error('❌ [WiFi Config] Send failed:', error);
      alert(t.sendFail || 'Failed to send WiFi config');
      setBleStep('select_wifi');
    }
  };

  const disconnectDevice = async () => {
    try { 
      if (connectedDeviceId) {
        await BleClient.write(connectedDeviceId, VG_SERVICE_UUID, VG_CHAR_UUID, new TextEncoder().encode("CANCEL_SETUP")).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100)); 
        await BleClient.disconnect(connectedDeviceId); 
      }
    } catch (e) { console.error(e); }
    setIncompleteData('');  // ★ 清除暫存數據
    goBack(); 
  };

  // 📦 將所有需要的變數同 Function 打包回傳俾 UI
  return {
    bleStep, foundDevices, connectedDeviceId, isScanning, availableWifi, wifiData, setWifiData,
    startScan, connectToDevice, sendWifiConfig, disconnectDevice
  };
};