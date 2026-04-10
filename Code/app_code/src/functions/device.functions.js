// ================== 📱 Device 業務邏輯層 ==================
// 所有關於設備管理的業務邏輯都在這裡

import { DeviceDB } from '../db/device.db';
import { UserDeviceDB } from '../db/userDevice.db';
import { ActivityLogDB } from '../db/activityLog.db';

/**
 * Device 服務（業務邏輯）
 * 處理設備相關的業務流程
 */
export const DeviceService = {
  /**
   * 用戶綁定新設備的完整流程
   * 1. 檢查設備是否存在，不存在就建立
   * 2. 建立用戶-設備關聯
   * @param {string} userId - 用戶 ID
   * @param {string} deviceId - 設備 ID
   * @param {string} deviceName - 設備名稱
   * @returns {Promise<Object>} { ok, message }
   */
  bindDevice: async (userId, deviceId, deviceName) => {
    try {
      // 檢查設備是否已存在
      const deviceExists = await DeviceDB.exists(deviceId);

      if (!deviceExists) {
        // 建立新設備
        await DeviceDB.create({
          device_id: deviceId,
          device_name: deviceName,
          language_setting: 'en'
        });
      }

      // 建立用戶-設備關聯
      await UserDeviceDB.bind(userId, deviceId);

      return {
        ok: true,
        message: '✅ 設備已成功綁定'
      };
    } catch (error) {
      console.error('綁定設備失敗:', error);
      return {
        ok: false,
        message: error.message || '❌ 綁定設備失敗'
      };
    }
  },

  /**
   * 用戶解除設備綁定的完整流程
   * 1. 刪除用戶-設備關聯
   * 2. 如果沒有其他用戶擁有該設備，則刪除設備
   * @param {string} userId - 用戶 ID
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, message }
   */
  unbindDevice: async (userId, deviceId) => {
    try {
      // 刪除用戶-設備關聯
      await UserDeviceDB.unbind(userId, deviceId);

      // 檢查是否還有其他用戶擁有該設備
      const userCount = await UserDeviceDB.countDeviceUsers(deviceId);

      if (userCount === 0) {
        // 沒有用戶擁有，清理設備記錄
        await DeviceDB.delete(deviceId);
      }

      return {
        ok: true,
        message: '✅ 設備已解除綁定'
      };
    } catch (error) {
      console.error('解除綁定失敗:', error);
      return {
        ok: false,
        message: error.message || '❌ 解除綁定失敗'
      };
    }
  },

  /**
   * 取得用戶的所有設備列表
   * @param {string} userId - 用戶 ID
   * @returns {Promise<Object>} { ok, devices, message }
   */
  getUserDevices: async (userId) => {
    try {
      const devices = await UserDeviceDB.findDevicesByUser(userId);
      return {
        ok: true,
        devices,
        message: '✅ 已取得設備列表'
      };
    } catch (error) {
      return {
        ok: false,
        devices: [],
        message: error.message
      };
    }
  },

  /**
   * 更新設備名稱
   * @param {string} deviceId - 設備 ID
   * @param {string} newName - 新設備名稱
   * @returns {Promise<Object>} { ok, message }
   */
  renameDevice: async (deviceId, newName) => {
    try {
      await DeviceDB.updateName(deviceId, newName);
      return {
        ok: true,
        message: '✅ 設備名稱已更新'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 更新設備的語言設定
   * @param {string} deviceId - 設備 ID
   * @param {string} languageSetting - 語言代碼
   * @returns {Promise<Object>} { ok, message }
   */
  updateDeviceLanguage: async (deviceId, languageSetting) => {
    try {
      await DeviceDB.updateLanguageSetting(deviceId, languageSetting);
      return {
        ok: true,
        message: '✅ 設備語言已更新'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 更新設備的在線狀態和電池電量
   * @param {string} deviceId - 設備 ID
   * @param {boolean} isOnline - 是否在線
   * @param {number} batteryLevel - 電池電量 (0-100)
   * @returns {Promise<Object>} { ok, message }
   */
  updateDeviceStatus: async (deviceId, isOnline, batteryLevel) => {
    try {
      await DeviceDB.updateStatus(deviceId, {
        is_online: isOnline,
        battery_level: batteryLevel
      });
      return {
        ok: true,
        message: '✅ 設備狀態已更新'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 獲取設備詳細資訊（含狀態）
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, device, message }
   */
  getDeviceInfo: async (deviceId) => {
    try {
      const device = await DeviceDB.findById(deviceId);
      return {
        ok: true,
        device,
        message: '✅ 已取得設備資訊'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  }
};
