// ================== Device Service (Business Logic Layer) ==================
// Handles all device management business processes: bind/unbind devices,
// fetch device lists, update device settings and status.
// Calls DeviceDB, UserDeviceDB, ActivityLogDB for database operations.

import { DeviceDB } from '../db/device.db';
import { UserDeviceDB } from '../db/userDevice.db';
import { ActivityLogDB } from '../db/activityLog.db';

export const DeviceService = {
  /**
   * Bind a device to a user account.
   * Creates the device record if it does not yet exist, then links it to the user.
   * @param {string} userId
   * @param {string} deviceId
   * @param {string} deviceName
   * @returns {Promise<{ok, message}>}
   */
  bindDevice: async (userId, deviceId, deviceName) => {
    try {
      const deviceExists = await DeviceDB.exists(deviceId);

      if (!deviceExists) {
        await DeviceDB.create({ device_id: deviceId, device_name: deviceName, language_setting: 'en' });
      }

      await UserDeviceDB.bind(userId, deviceId);
      return { ok: true, message: '✅ Device successfully bound' };
    } catch (error) {
      console.error('Device binding failed:', error);
      return { ok: false, message: error.message || '❌ Device binding failed' };
    }
  },

  /**
   * Unbind a device from a user account.
   * If no other users own the device after removal, the device record is deleted.
   * @param {string} userId
   * @param {string} deviceId
   * @returns {Promise<{ok, message}>}
   */
  unbindDevice: async (userId, deviceId) => {
    try {
      await UserDeviceDB.unbind(userId, deviceId);

      // Clean up orphaned device record if no other user owns it
      const userCount = await UserDeviceDB.countDeviceUsers(deviceId);
      if (userCount === 0) {
        await DeviceDB.delete(deviceId);
      }

      return { ok: true, message: '✅ Device successfully unbound' };
    } catch (error) {
      console.error('Device unbinding failed:', error);
      return { ok: false, message: error.message || '❌ Device unbinding failed' };
    }
  },

  /**
   * Get all devices linked to a user, with status information
   * @param {string} userId
   * @returns {Promise<{ok, devices, message}>}
   */
  getUserDevices: async (userId) => {
    try {
      const devices = await UserDeviceDB.findDevicesByUser(userId);
      return { ok: true, devices, message: '✅ Device list retrieved' };
    } catch (error) {
      return { ok: false, devices: [], message: error.message };
    }
  },

  /**
   * Rename a device
   * @param {string} deviceId
   * @param {string} newName
   * @returns {Promise<{ok, message}>}
   */
  renameDevice: async (deviceId, newName) => {
    try {
      await DeviceDB.updateName(deviceId, newName);
      return { ok: true, message: '✅ Device name updated' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Update the language setting stored on the device
   * @param {string} deviceId
   * @param {string} languageSetting - 'en' | 'zh'
   * @returns {Promise<{ok, message}>}
   */
  updateDeviceLanguage: async (deviceId, languageSetting) => {
    try {
      await DeviceDB.updateLanguageSetting(deviceId, languageSetting);
      return { ok: true, message: '✅ Device language updated' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Update the online status and battery level of a device
   * @param {string} deviceId
   * @param {boolean} isOnline
   * @param {number} batteryLevel - 0-100
   * @returns {Promise<{ok, message}>}
   */
  updateDeviceStatus: async (deviceId, isOnline, batteryLevel) => {
    try {
      await DeviceDB.updateStatus(deviceId, { is_online: isOnline, battery_level: batteryLevel });
      return { ok: true, message: '✅ Device status updated' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Fetch full device info including device_status
   * @param {string} deviceId
   * @returns {Promise<{ok, device?, message}>}
   */
  getDeviceInfo: async (deviceId) => {
    try {
      const device = await DeviceDB.findById(deviceId);
      return { ok: true, device, message: '✅ Device info retrieved' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
};
