// ================== 📱 Device Business Logic Layer ==================
// All business logic related to device management is here

import { DeviceDB } from '../db/device.db';
import { UserDeviceDB } from '../db/userDevice.db';
import { ActivityLogDB } from '../db/activityLog.db';

/**
 * Device Service (Business Logic)
 * Handles device-related business processes
 */
export const DeviceService = {
  /**
   * Complete flow for user to bind a new device
   * 1. Check if device exists, create if not
   * 2. Create user-device association
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {string} deviceName - Device name
   * @returns {Promise<Object>} { ok, message }
   */
  bindDevice: async (userId, deviceId, deviceName) => {
    try {
      // Check if device already exists
      const deviceExists = await DeviceDB.exists(deviceId);

      if (!deviceExists) {
        // Create new device
        await DeviceDB.create({
          device_id: deviceId,
          device_name: deviceName,
          language_setting: 'en'
        });
      }

      // Create user-device association
      await UserDeviceDB.bind(userId, deviceId);

      return {
        ok: true,
        message: '✅ Device successfully bound'
      };
    } catch (error) {
      console.error('Device binding failed:', error);
      return {
        ok: false,
        message: error.message || '❌ Device binding failed'
      };
    }
  },

  /**
   * Complete flow for user to unbind a device
   * 1. Delete user-device association
   * 2. If no other users have the device, delete the device
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} { ok, message }
   */
  unbindDevice: async (userId, deviceId) => {
    try {
      // Delete user-device association
      await UserDeviceDB.unbind(userId, deviceId);

      // Check if any other users still have the device
      const userCount = await UserDeviceDB.countDeviceUsers(deviceId);

      if (userCount === 0) {
        // No users have the device, clean up device record
        await DeviceDB.delete(deviceId);
      }

      return {
        ok: true,
        message: '✅ Device successfully unbound'
      };
    } catch (error) {
      console.error('Device unbinding failed:', error);
      return {
        ok: false,
        message: error.message || '❌ Device unbinding failed'
      };
    }
  },

  /**
   * Get all devices for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} { ok, devices, message }
   */
  getUserDevices: async (userId) => {
    try {
      const devices = await UserDeviceDB.findDevicesByUser(userId);
      return {
        ok: true,
        devices,
        message: '✅ Device list retrieved'
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
