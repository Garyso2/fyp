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
   * Generate next activity ID in format A001, A002, ...
   */
  getNextActivityId: async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select('activity_id');

    let max = 0;
    if (data) {
      for (const row of data) {
        const match = row.activity_id?.match(/^A(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    }
    return 'A' + String(max + 1).padStart(3, '0');
  },

  /**
   * Create a new activity log entry
   * @param {Object} logData - { device_id, activity_type, detected_content, image_url }
   * @returns {Promise<Object>} Newly created log object
   */
  create: async (logData) => {
    const {
      device_id,
      activity_type,
      detected_content = null,
      image_url = null
    } = logData;

    const activity_id = await ActivityLogDB.getNextActivityId();

    const { data, error } = await supabase
      .from('activity_logs')
      .insert([{
        activity_id,
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
   * @param {number} limit - Records per page (default 50)
   * @param {number} offset - Pagination offset (default 0)
   * @returns {Promise<Array>} Array of log objects
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
   * Query logs within a time range
   * @param {string} deviceId - Device ID
   * @param {string} startTime - Start time (ISO 8601)
   * @param {string} endTime - End time (ISO 8601)
   * @returns {Promise<Array>} Array of log objects
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
   * Query logs by activity type
   * @param {string} deviceId - Device ID
   * @param {string} activityType - Activity type (see ACTIVITY_TYPES constants)
   * @param {number} limit - Max records to return
   * @returns {Promise<Array>} Array of log objects
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
   * Count total log entries for a device
   * @param {string} deviceId - Device ID
   * @returns {Promise<number>} Total count
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
   * Delete a single log entry
   * @param {number} activityId - Activity log ID
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
   * Delete all logs for a device
   * @param {string} deviceId - Device ID
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
   * Delete all logs created before a given timestamp (data maintenance)
   * @param {string} beforeTime - ISO 8601 timestamp cutoff
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
