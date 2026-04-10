// ================== ⚙️ 業務邏輯層 (Functions) ==================
// 所有與 API、BLE、業務流程有關嘅邏輯都寫喺呢度

import { db } from './db';
import { BleClient } from '@capacitor-community/bluetooth-le';

const VG_SERVICE_UUID = 'a07498ca-ad5b-474e-940d-16f1fbe7e8cd';
const VG_CHAR_UUID = '51ff12cb-fdf0-4222-800f-b91f37d3d224';

export const functions = {
  
  // ============ 👤 用戶認證相關 ============

  // 登入邏輯
  handleLogin: async (username, password) => {
    try {
      const user = await db.login({ username, password });
      return { status: 'success', user };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  },

  // 註冊邏輯
  handleRegister: async (username, password) => {
    try {
      if (!username || !password) {
        throw new Error('❌ 用戶名和密碼不能為空');
      }
      const user = await db.register({ username, password });
      return { status: 'success', message: '✅ 註冊成功！請登入', user };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  },

  // Admin 後門（開發用）
  adminBackdoor: (username, password) => {
    if (username === 'admin' && password === 'admin') {
      return {
        user_id: 'admin_999',
        username: 'Super Admin',
        language: 'en'
      };
    }
    return null;
  },

  // ============ 📱 設備管理相關 ============

  // 綁定設備到帳號
  handleBindDevice: async ({ user_id, device_id, device_name }) => {
    try {
      await db.bindDevice({ user_id, device_id, device_name });
      return { ok: true, message: '✅ 設備已成功綁定' };
    } catch (error) {
      console.error('設備綁定失敗:', error);
      return { ok: false, message: error.message };
    }
  },

  // 移除設備
  handleRemoveDevice: async (userId, deviceId) => {
    try {
      await db.removeDevice(userId, deviceId);
      return { ok: true, message: '✅ 設備已移除' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 獲取我的設備列表
  getDevicesList: async (userId) => {
    try {
      const devices = await db.getMyDevices(userId);
      return { status: 'success', devices };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  },

  // ============ 🔌 藍牙設置相關 ============

  // 初始化藍牙掃描
  initializeBleScan: async (callback) => {
    try {
      await BleClient.initialize();
      await BleClient.requestLEScan(
        { services: [VG_SERVICE_UUID] },
        (result) => {
          callback(result.device);
        }
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 停止藍牙掃描
  stopBleScan: async () => {
    try {
      await BleClient.stopLEScan();
      return { ok: true };
    } catch (error) {
      console.error('停止掃描失敗:', error);
    }
  },

  // 連接藍牙設備
  connectBleDevice: async (deviceId, onNotification) => {
    try {
      // 防呆：先斷開任何舊連接
      try {
        await BleClient.disconnect(deviceId);
      } catch (e) {
        // 冇舊連接，忽略
      }

      // 連接新設備
      await BleClient.connect(deviceId, () => {
        console.log('設備已斷線');
      });

      // 啟動通知監聽
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          const text = new TextDecoder().decode(value.buffer);
          onNotification(text);
        }
      );

      return { ok: true, deviceId };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 斷開藍牙設備
  disconnectBleDevice: async (deviceId) => {
    try {
      if (deviceId) {
        // 發送取消信號
        try {
          const cancelMsg = new TextEncoder().encode('CANCEL_SETUP');
          await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, cancelMsg);
        } catch (e) {
          // 忽略寫入失敗
        }

        // 等待後斷開連接
        await new Promise(resolve => setTimeout(resolve, 100));
        await BleClient.disconnect(deviceId);
      }
      return { ok: true };
    } catch (error) {
      console.error('斷開設備失敗:', error);
      return { ok: false };
    }
  },

  // 掃描 WiFi 網絡
  scanWifi: async (deviceId) => {
    try {
      const scanMsg = new TextEncoder().encode('SCAN_WIFI');
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, scanMsg);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 發送 WiFi 配置到設備
  sendWifiConfig: async (deviceId, { ssid, password }) => {
    try {
      if (!ssid || !password) {
        throw new Error('❌ SSID 和密碼不能為空');
      }

      const wifiConfig = JSON.stringify({ ssid, password });
      const data = new TextEncoder().encode(wifiConfig);
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);

      return { ok: true, message: '✅ WiFi 配置已發送' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 解析 WiFi 掃描結果
  parseWifiScanResult: (jsonText) => {
    try {
      const data = JSON.parse(jsonText);
      return data.ssids || [];
    } catch (e) {
      return [];
    }
  },

  // ============ 📜 日誌管理相關 ============

  // 獲取設備日誌
  getDeviceLogs: async (deviceId) => {
    try {
      const logs = await db.getDeviceLogs(deviceId);
      return { status: 'success', logs };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  },

  // 添加活動日誌
  addLog: async ({ device_id, activity_type, detected_content, image_url }) => {
    try {
      const log = await db.addActivityLog({
        device_id,
        activity_type,
        detected_content,
        image_url
      });
      return { ok: true, log };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // 刪除日誌
  deleteLog: async (activityId) => {
    try {
      await db.deleteLog(activityId);
      return { ok: true, message: '✅ 日誌已刪除' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  // ============ 🛠️ 工具函數 ============

  // 格式化時間
  formatTime: (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-HK');
  },

  // 獲取設備在線狀態文字
  getStatusLabel: (isOnline, language = 'en') => {
    const labels = {
      en: { online: 'Online', offline: 'Offline' },
      zh: { online: '在線', offline: '離線' }
    };
    return isOnline ? labels[language].online : labels[language].offline;
  },

  // 獲取設備狀態顏色
  getStatusBadgeClass: (isOnline) => {
    return isOnline ? 'bg-success' : 'bg-danger';
  },

  // 電池百分比到顏色
  getBatteryColor: (level) => {
    if (level >= 70) return '#28a745'; // 綠
    if (level >= 40) return '#ffc107'; // 黃
    return '#dc3545'; // 紅
  },

  // 電池百分比到文字
  getBatteryLabel: (level) => {
    if (level === '--') return '---';
    return `${level}%`;
  }
};
