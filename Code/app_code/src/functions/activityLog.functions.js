// ================== 📜 ActivityLog 業務邏輯層 ==================
// 所有關於活動日誌的業務邏輯都在這裡

import { ActivityLogDB } from '../db/activityLog.db';

/**
 * ActivityLog 服務（業務邏輯）
 * 處理日誌的查詢、新增、刪除等業務流程
 */
export const ActivityLogService = {
  /**
   * 新增活動日誌
   * @param {string} deviceId - 設備 ID
   * @param {string} activityType - 活動類型 (如 'Detection', 'Error', 'Alert')
   * @param {string} detectedContent - 檢測到的內容
   * @param {string} imageUrl - 快照圖片 URL
   * @returns {Promise<Object>} { ok, log, message }
   */
  createLog: async (deviceId, activityType, detectedContent, imageUrl) => {
    try {
      const log = await ActivityLogDB.create({
        device_id: deviceId,
        activity_type: activityType,
        detected_content: detectedContent,
        image_url: imageUrl
      });

      return {
        ok: true,
        log,
        message: '✅ 日誌已新增'
      };
    } catch (error) {
      console.error('新增日誌失敗:', error);
      return {
        ok: false,
        message: error.message || '❌ 新增日誌失敗'
      };
    }
  },

  /**
   * 獲取設備的活動日誌（分頁）
   * @param {string} deviceId - 設備 ID
   * @param {number} pageSize - 每頁大小（預設 50）
   * @param {number} pageNumber - 第幾頁（預設 1）
   * @returns {Promise<Object>} { ok, logs, message }
   */
  getDeviceLogs: async (deviceId, pageSize = 50, pageNumber = 1) => {
    try {
      const offset = (pageNumber - 1) * pageSize;
      const logs = await ActivityLogDB.findByDeviceId(deviceId, pageSize, offset);

      return {
        ok: true,
        logs,
        message: '✅ 已取得日誌列表'
      };
    } catch (error) {
      return {
        ok: false,
        logs: [],
        message: error.message
      };
    }
  },

  /**
   * 查詢設備在指定時間範圍內的日誌
   * @param {string} deviceId - 設備 ID
   * @param {string} startTime - 開始時間 (ISO 8601)
   * @param {string} endTime - 結束時間 (ISO 8601)
   * @returns {Promise<Object>} { ok, logs, message }
   */
  getLogsByTimeRange: async (deviceId, startTime, endTime) => {
    try {
      const logs = await ActivityLogDB.findByDeviceIdAndTimeRange(
        deviceId,
        startTime,
        endTime
      );

      return {
        ok: true,
        logs,
        message: '✅ 已取得日誌列表'
      };
    } catch (error) {
      return {
        ok: false,
        logs: [],
        message: error.message
      };
    }
  },

  /**
   * 查詢特定活動類型的日誌
   * @param {string} deviceId - 設備 ID
   * @param {string} activityType - 活動類型
   * @param {number} limit - 返回的最多日誌數
   * @returns {Promise<Object>} { ok, logs, message }
   */
  getLogsByType: async (deviceId, activityType, limit = 50) => {
    try {
      const logs = await ActivityLogDB.findByDeviceIdAndType(
        deviceId,
        activityType,
        limit
      );

      return {
        ok: true,
        logs,
        message: '✅ 已取得日誌列表'
      };
    } catch (error) {
      return {
        ok: false,
        logs: [],
        message: error.message
      };
    }
  },

  /**
   * 刪除單筆日誌
   * @param {number} activityId - 活動日誌 ID
   * @returns {Promise<Object>} { ok, message }
   */
  deleteLog: async (activityId) => {
    try {
      await ActivityLogDB.delete(activityId);
      return {
        ok: true,
        message: '✅ 日誌已刪除'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 清空設備的所有日誌
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, message }
   */
  clearDeviceLogs: async (deviceId) => {
    try {
      await ActivityLogDB.deleteByDeviceId(deviceId);
      return {
        ok: true,
        message: '✅ 日誌已清空'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 獲取設備的日誌統計資訊
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} { ok, count, message }
   */
  getLogCount: async (deviceId) => {
    try {
      const count = await ActivityLogDB.countByDeviceId(deviceId);
      return {
        ok: true,
        count,
        message: '✅ 已取得日誌統計'
      };
    } catch (error) {
      return {
        ok: false,
        count: 0,
        message: error.message
      };
    }
  },

  /**
   * 清理超過指定期限的日誌（數據維護用）
   * @param {number} daysOld - 多少天前的日誌（如 30）
   * @returns {Promise<Object>} { ok, message }
   */
  cleanupOldLogs: async (daysOld) => {
    try {
      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - daysOld);
      const beforeTime = beforeDate.toISOString();

      await ActivityLogDB.deleteBeforeTime(beforeTime);

      return {
        ok: true,
        message: `✅ 已清理 ${daysOld} 天前的日誌`
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 格式化日誌時間顯示
   * @param {string} timestamp - ISO 8601 時間戳
   * @param {string} language - 語言 (en, zh)
   * @returns {string} 格式化後的時間文字
   */
  formatLogTime: (timestamp, language = 'en') => {
    try {
      const date = new Date(timestamp);

      if (language === 'zh') {
        return date.toLocaleString('zh-HK');
      } else {
        return date.toLocaleString('en-US');
      }
    } catch (e) {
      return 'Invalid Date';
    }
  }
};
