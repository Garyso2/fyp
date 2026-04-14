// ================== 🔌 BLE Bluetooth Business Logic Layer ==================
// All business logic related to Bluetooth setup, scanning, WiFi configuration is here

import { BleClient } from '@capacitor-community/bluetooth-le';

// UUID Constants (shared standard with Pi device)
const VG_SERVICE_UUID = 'a07498ca-ad5b-474e-940d-16f1fbe7e8cd';
const VG_CHAR_UUID = '51ff12cb-fdf0-4222-800f-b91f37d3d224';

/**
 * BLE Service (Business Logic)
 * Handles Bluetooth scanning, connection, WiFi configuration and other processes
 */
export const BleService = {
  // ============ 藍牙掃描相關 ============

  /**
   * 初始化並開始掃描藍牙設備
   * @param {Function} onDeviceFound - 找到設備時的回調函數
   * @returns {Promise<Object>} { ok, message }
   */
  startScan: async (onDeviceFound) => {
    try {
      await BleClient.initialize();

      await BleClient.requestLEScan(
        { services: [VG_SERVICE_UUID] },
        (result) => {
          if (onDeviceFound && result.device) {
            onDeviceFound(result.device);
          }
        }
      );

      return { ok: true, message: '✅ 掃描已開始' };
    } catch (error) {
      console.error('掃描失敗:', error);
      return { ok: false, message: error.message || '❌ 掃描失敗' };
    }
  },

  /**
   * 停止藍牙掃描
   * @returns {Promise<Object>} { ok, message }
   */
  stopScan: async () => {
    try {
      await BleClient.stopLEScan();
      return { ok: true, message: '✅ 掃描已停止' };
    } catch (error) {
      console.error('停止掃描失敗:', error);
      return { ok: false, message: error.message };
    }
  },

  // ============ 設備連接相關 ============

  /**
   * 連接到藍牙設備並開始監聽通知
   * @param {string} deviceId - 設備 ID
   * @param {Function} onNotification - 接收通知時的回調函數
   * @returns {Promise<Object>} { ok, deviceId, message }
   */
  connectDevice: async (deviceId, onNotification) => {
    try {
      // 防呆：先嘗試斷開舊連接
      try {
        await BleClient.disconnect(deviceId);
      } catch (e) {
        // 冇舊連接，忽略
      }

      // 連接新設備
      await BleClient.connect(deviceId, () => {
        console.log('❌ 設備已斷線');
      });

      // 啟動通知監聽
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          const text = new TextDecoder().decode(value.buffer);
          if (onNotification) {
            onNotification(text);
          }
        }
      );

      return { ok: true, deviceId, message: '✅ 已連接到設備' };
    } catch (error) {
      console.error('連接失敗:', error);
      return { ok: false, message: error.message || '❌ 連接失敗' };
    }
  },

  /**
   * 斷開藍牙設備連接
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, message }
   */
  disconnectDevice: async (deviceId) => {
    try {
      if (deviceId) {
        // 發送取消信號
        try {
          const cancelMsg = new TextEncoder().encode('CANCEL_SETUP');
          await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, cancelMsg);
        } catch (e) {
          // 忽略失敗
        }

        // 等待後斷開連接
        await new Promise(resolve => setTimeout(resolve, 100));
        await BleClient.disconnect(deviceId);
      }
      return { ok: true, message: '✅ 已斷開連接' };
    } catch (error) {
      console.error('斷開失敗:', error);
      return { ok: false, message: error.message };
    }
  },

  // ============ WiFi 設置相關 ============

  /**
   * 命令設備掃描可用的 WiFi 網絡
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, message }
   */
  scanWifi: async (deviceId) => {
    try {
      const scanMsg = new TextEncoder().encode('SCAN_WIFI');
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, scanMsg);
      return { ok: true, message: '✅ 已要求設備掃描 WiFi' };
    } catch (error) {
      console.error('掃描 WiFi 失敗:', error);
      return { ok: false, message: error.message };
    }
  },

  /**
   * 解析設備返回的 WiFi 掃描結果
   * @param {string} jsonText - 設備返回的 JSON 字符串
   * @returns {Array} SSID 列表
   */
  parseWifiScanResult: (jsonText) => {
    try {
      const data = JSON.parse(jsonText);
      return data.ssids || [];
    } catch (e) {
      console.error('解析 WiFi 結果失敗:', e);
      return [];
    }
  },

  /**
   * 發送 WiFi 認證信息到設備
   * @param {string} deviceId - 設備 ID
   * @param {string} ssid - WiFi SSID
   * @param {string} password - WiFi 密碼
   * @returns {Promise<Object>} { ok, message }
   */
  sendWifiConfig: async (deviceId, ssid, password) => {
    try {
      // 防呆檢驗
      if (!ssid || !password) {
        return { ok: false, message: '❌ SSID 和密碼不能為空' };
      }

      const wifiConfig = JSON.stringify({ ssid, password });
      const configData = new TextEncoder().encode(wifiConfig);

      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, configData);

      return { ok: true, message: '✅ WiFi 配置已發送' };
    } catch (error) {
      console.error('發送 WiFi 配置失敗:', error);
      return { ok: false, message: error.message };
    }
  },

  // ============ 回應處理相關 ============

  /**
   * 解析設備的藍牙通知消息
   * @param {string} message - 設備發送的消息
   * @returns {Object} { type, data }
   *   type: 'wifi_list' | 'wifi_success' | 'wifi_fail' | 'wifi_timeout' | 'unknown'
   */
  parseDeviceMessage: (message) => {
    if (message.includes('"ssids"')) {
      // WiFi 列表
      try {
        const data = JSON.parse(message);
        return {
          type: 'wifi_list',
          data: data.ssids || []
        };
      } catch (e) {
        return { type: 'unknown', data: null };
      }
    } else if (message === 'WIFI_SUCCESS') {
      return { type: 'wifi_success', data: null };
    } else if (message === 'WIFI_FAIL') {
      return { type: 'wifi_fail', data: null };
    } else if (message === 'WIFI_TIMEOUT') {
      return { type: 'wifi_timeout', data: null };
    }

    return { type: 'unknown', data: message };
  }
};
