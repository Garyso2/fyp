// ================== ActivityLog Service (Business Logic Layer) ==================
// Handles all activity log business processes: create, query, delete, and cleanup.
// Calls ActivityLogDB for all database operations.

import { ActivityLogDB } from '../db/activityLog.db';

export const ActivityLogService = {
  /**
   * Create a new activity log entry
   * @param {string} deviceId
   * @param {string} activityType - e.g. 'FALL_DETECTION', 'AI_SCENE_ANALYSIS'
   * @param {string} detectedContent - Detected content description
   * @param {string} imageUrl - Snapshot image URL
   * @returns {Promise<{ok, log?, message}>}
   */
  createLog: async (deviceId, activityType, detectedContent, imageUrl) => {
    try {
      const log = await ActivityLogDB.create({
        device_id: deviceId,
        activity_type: activityType,
        detected_content: detectedContent,
        image_url: imageUrl
      });
      return { ok: true, log, message: '✅ Log created' };
    } catch (error) {
      console.error('Create log failed:', error);
      return { ok: false, message: error.message || '❌ Failed to create log' };
    }
  },

  /**
   * Get paginated activity logs for a device (newest first)
   * @param {string} deviceId
   * @param {number} pageSize - Records per page (default 50)
   * @param {number} pageNumber - 1-based page index (default 1)
   * @returns {Promise<{ok, logs, message}>}
   */
  getDeviceLogs: async (deviceId, pageSize = 50, pageNumber = 1) => {
    try {
      const offset = (pageNumber - 1) * pageSize;
      const logs = await ActivityLogDB.findByDeviceId(deviceId, pageSize, offset);
      return { ok: true, logs, message: '✅ Log list retrieved' };
    } catch (error) {
      return { ok: false, logs: [], message: error.message };
    }
  },

  /**
   * Get logs within a specific time range
   * @param {string} deviceId
   * @param {string} startTime - ISO 8601 timestamp
   * @param {string} endTime - ISO 8601 timestamp
   * @returns {Promise<{ok, logs, message}>}
   */
  getLogsByTimeRange: async (deviceId, startTime, endTime) => {
    try {
      const logs = await ActivityLogDB.findByDeviceIdAndTimeRange(deviceId, startTime, endTime);
      return { ok: true, logs, message: '✅ Log list retrieved' };
    } catch (error) {
      return { ok: false, logs: [], message: error.message };
    }
  },

  /**
   * Get logs filtered by activity type
   * @param {string} deviceId
   * @param {string} activityType - Use ACTIVITY_TYPES constants
   * @param {number} limit - Max records to return (default 50)
   * @returns {Promise<{ok, logs, message}>}
   */
  getLogsByType: async (deviceId, activityType, limit = 50) => {
    try {
      const logs = await ActivityLogDB.findByDeviceIdAndType(deviceId, activityType, limit);
      return { ok: true, logs, message: '✅ Log list retrieved' };
    } catch (error) {
      return { ok: false, logs: [], message: error.message };
    }
  },

  /**
   * Delete a single log entry
   * @param {number} activityId
   * @returns {Promise<{ok, message}>}
   */
  deleteLog: async (activityId) => {
    try {
      await ActivityLogDB.delete(activityId);
      return { ok: true, message: '✅ Log deleted' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Clear all logs for a device
   * @param {string} deviceId
   * @returns {Promise<{ok, message}>}
   */
  clearDeviceLogs: async (deviceId) => {
    try {
      await ActivityLogDB.deleteByDeviceId(deviceId);
      return { ok: true, message: '✅ All logs cleared' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Get the total log count for a device
   * @param {string} deviceId
   * @returns {Promise<{ok, count, message}>}
   */
  getLogCount: async (deviceId) => {
    try {
      const count = await ActivityLogDB.countByDeviceId(deviceId);
      return { ok: true, count, message: '✅ Log count retrieved' };
    } catch (error) {
      return { ok: false, count: 0, message: error.message };
    }
  },

  /**
   * Delete logs older than a specified number of days (data maintenance)
   * @param {number} daysOld - e.g. 30 to delete logs older than 30 days
   * @returns {Promise<{ok, message}>}
   */
  cleanupOldLogs: async (daysOld) => {
    try {
      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - daysOld);
      await ActivityLogDB.deleteBeforeTime(beforeDate.toISOString());
      return { ok: true, message: `✅ Logs older than ${daysOld} days deleted` };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Format a log timestamp for display
   * @param {string} timestamp - ISO 8601 timestamp
   * @param {string} language - 'en' | 'zh'
   * @returns {string} Locale-formatted date string
   */
  formatLogTime: (timestamp, language = 'en') => {
    try {
      const date = new Date(timestamp);
      return language === 'zh'
        ? date.toLocaleString('zh-HK')
        : date.toLocaleString('en-US');
    } catch (e) {
      return 'Invalid Date';
    }
  }
};
