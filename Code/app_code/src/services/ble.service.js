// ================== BLE Service (Business Logic Layer) ==================
// Handles all Bluetooth Low Energy operations: scan, connect, disconnect,
// WiFi configuration, and message parsing. UUIDs are shared with the Pi device.

import { BleClient } from '@capacitor-community/bluetooth-le';
import { BLE_SERVICE_UUID, BLE_CHAR_UUID } from '../constants';

export const BleService = {
  // --- Scanning ---

  /**
   * Initialise BLE and start scanning for VisualGuard Pi devices
   * @param {Function} onDeviceFound - Called each time a device is discovered
   * @returns {Promise<{ok, message}>}
   */
  startScan: async (onDeviceFound) => {
    try {
      await BleClient.initialize();
      await BleClient.requestLEScan(
        { services: [BLE_SERVICE_UUID] },
        (result) => { if (onDeviceFound && result.device) onDeviceFound(result.device); }
      );
      return { ok: true, message: '✅ Scan started' };
    } catch (error) {
      console.error('BLE scan failed:', error);
      return { ok: false, message: error.message || '❌ Scan failed' };
    }
  },

  /**
   * Stop an active BLE scan
   * @returns {Promise<{ok, message}>}
   */
  stopScan: async () => {
    try {
      await BleClient.stopLEScan();
      return { ok: true, message: '✅ Scan stopped' };
    } catch (error) {
      console.error('Stop scan failed:', error);
      return { ok: false, message: error.message };
    }
  },

  // --- Connection ---

  /**
   * Connect to a BLE device and start listening for notifications.
   * Clears any stale connection first to avoid conflicts.
   * @param {string} deviceId
   * @param {Function} onNotification - Called with decoded text on each BLE notification
   * @returns {Promise<{ok, deviceId?, message}>}
   */
  connectDevice: async (deviceId, onNotification) => {
    try {
      // Clear any stale connection first
      try { await BleClient.disconnect(deviceId); } catch (e) { /* no prior connection */ }

      await BleClient.connect(deviceId, () => { console.log('BLE device disconnected'); });

      await BleClient.startNotifications(
        deviceId, BLE_SERVICE_UUID, BLE_CHAR_UUID,
        (value) => {
          const text = new TextDecoder().decode(value.buffer);
          if (onNotification) onNotification(text);
        }
      );
      return { ok: true, deviceId, message: '✅ Connected to device' };
    } catch (error) {
      console.error('BLE connect failed:', error);
      return { ok: false, message: error.message || '❌ Connection failed' };
    }
  },

  /**
   * Gracefully disconnect from a BLE device.
   * Sends a CANCEL_SETUP signal first so the Pi can clean up its state.
   * @param {string} deviceId
   * @returns {Promise<{ok, message}>}
   */
  disconnectDevice: async (deviceId) => {
    try {
      if (deviceId) {
        // Notify Pi before disconnecting
        try {
          await BleClient.write(deviceId, BLE_SERVICE_UUID, BLE_CHAR_UUID,
            new TextEncoder().encode('CANCEL_SETUP'));
        } catch (e) { /* ignore write failure on disconnect */ }

        await new Promise(resolve => setTimeout(resolve, 100));
        await BleClient.disconnect(deviceId);
      }
      return { ok: true, message: '✅ Disconnected' };
    } catch (error) {
      console.error('BLE disconnect failed:', error);
      return { ok: false, message: error.message };
    }
  },

  // --- WiFi Configuration (sent over BLE to Pi) ---

  /**
   * Command the Pi to scan nearby WiFi networks
   * @param {string} deviceId
   * @returns {Promise<{ok, message}>}
   */
  scanWifi: async (deviceId) => {
    try {
      await BleClient.write(deviceId, BLE_SERVICE_UUID, BLE_CHAR_UUID,
        new TextEncoder().encode('SCAN_WIFI'));
      return { ok: true, message: '✅ WiFi scan requested' };
    } catch (error) {
      console.error('WiFi scan command failed:', error);
      return { ok: false, message: error.message };
    }
  },

  /**
   * Parse the JSON WiFi list returned by the Pi
   * @param {string} jsonText
   * @returns {Array<string>} Array of SSIDs
   */
  parseWifiScanResult: (jsonText) => {
    try {
      const data = JSON.parse(jsonText);
      return data.ssids || [];
    } catch (e) {
      console.error('Failed to parse WiFi scan result:', e);
      return [];
    }
  },

  /**
   * Send WiFi credentials to the Pi over BLE
   * @param {string} deviceId
   * @param {string} ssid
   * @param {string} password
   * @returns {Promise<{ok, message}>}
   */
  sendWifiConfig: async (deviceId, ssid, password) => {
    try {
      if (!ssid || !password) {
        return { ok: false, message: '❌ SSID and password cannot be empty' };
      }
      const configData = new TextEncoder().encode(JSON.stringify({ ssid, password }));
      await BleClient.write(deviceId, BLE_SERVICE_UUID, BLE_CHAR_UUID, configData);
      return { ok: true, message: '✅ WiFi config sent' };
    } catch (error) {
      console.error('Send WiFi config failed:', error);
      return { ok: false, message: error.message };
    }
  },

  // --- Message Parsing ---

  /**
   * Parse a raw BLE notification from the Pi into a typed message object
   * @param {string} message - Raw text received from Pi
   * @returns {{type: string, data: any}}
   *   type: 'wifi_list' | 'wifi_success' | 'wifi_fail' | 'wifi_timeout' | 'unknown'
   */
  parseDeviceMessage: (message) => {
    if (message.includes('"ssids"')) {
      try {
        const data = JSON.parse(message);
        return { type: 'wifi_list', data: data.ssids || [] };
      } catch (e) {
        return { type: 'unknown', data: null };
      }
    }
    if (message === 'WIFI_SUCCESS')  return { type: 'wifi_success', data: null };
    if (message === 'WIFI_FAIL')     return { type: 'wifi_fail',    data: null };
    if (message === 'WIFI_TIMEOUT')  return { type: 'wifi_timeout', data: null };
    return { type: 'unknown', data: message };
  }
};
