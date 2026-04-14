// ================== 📜 activity_logs Table Operation Layer ==================
// All database operations for activity_logs table are written here
// Records events that occur on the device (such as detected objects, activities, etc.)

import { supabase } from '../supabaseClient';

/**
 * ActivityLog Database Service
 * Responsible for all CRUD operations on activity_logs table
 */
export const ActivityLogDB = {
  /**
   * 添加活動日誌
   * @param {Object} logData - 日誌資料 { device_id, activity_type, detected_content, image_url }
   * @returns {Promise<Object>} 新建的日誌對象
   */
  create: async (logData) => {
    const {
      device_id,
      activity_type,
      detected_content = null,
      image_url = null
    } = logData;

    const { data, error } = await supabase
      .from('activity_logs')
      .insert([{
        device_id,
        activity_type,
        detected_content,
        image_url,
        time: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Query single log by ID
   * @param {number} activityId - Activity log ID
   * @returns {Promise<Object>} Log object
   */
  findById: async (activityId) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('activity_id', activityId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Query device activity logs list (paginated)
   * @param {string} deviceId - Device ID
   * @param {number} limit - Number of logs to return per request (default 50)
   * @param {number} offset - 偏移量，用於分頁（預設 0）
   * @returns {Promise<Array>} 日誌列表陣列
   */
  findByDeviceId: async (deviceId, limit = 50, offset = 0) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  /**
   * 查詢設備指定時間範圍內的日誌
   * @param {string} deviceId - 設備 ID
   * @param {string} startTime - 開始時間 (ISO 8601)
   * @param {string} endTime - 結束時間 (ISO 8601)
   * @returns {Promise<Array>} 日誌列表陣列
   */
  findByDeviceIdAndTimeRange: async (deviceId, startTime, endTime) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('device_id', deviceId)
      .gte('time', startTime)
      .lte('time', endTime)
      .order('time', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * 查詢設備特定型別的活動日誌
   * @param {string} deviceId - 設備 ID
   * @param {string} activityType - 活動類型
   * @param {number} limit - 返回的日誌數
   * @returns {Promise<Array>} 日誌列表陣列
   */
  findByDeviceIdAndType: async (deviceId, activityType, limit = 50) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('device_id', deviceId)
      .eq('activity_type', activityType)
      .order('time', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * 計算設備的日誌總數
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<number>} 日誌數量
   */
  countByDeviceId: async (deviceId) => {
    const { count, error } = await supabase
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    if (error) throw error;
    return count || 0;
  },

  /**
   * 刪除單筆日誌
   * @param {number} activityId - 活動日誌 ID
   * @returns {Promise<void>}
   */
  delete: async (activityId) => {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('activity_id', activityId);

    if (error) throw error;
  },

  /**
   * 刪除設備的所有日誌
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<void>}
   */
  deleteByDeviceId: async (deviceId) => {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  /**
   * 刪除指定時間之前的日誌（用於清理老舊資料）
   * @param {string} beforeTime - 時間戳 (ISO 8601)
   * @returns {Promise<void>}
   */
  deleteBeforeTime: async (beforeTime) => {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .lt('time', beforeTime);

    if (error) throw error;
  }
};
