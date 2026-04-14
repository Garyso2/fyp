// ================== 🔗 user_device Association Table Operation Layer ==================
// All database operations for user_device table (user-device associations) are written here

import { supabase } from '../supabaseClient';

/**
 * UserDevice Database Service
 * Responsible for all CRUD operations on user_device table
 * This is an association table maintaining many-to-many relationships between users and devices
 */
export const UserDeviceDB = {
  /**
   * Add user-device association (bind device)
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} Newly created association object
   */
  bind: async (userId, deviceId) => {
    const { data, error } = await supabase
      .from('user_device')
      .insert([{
        user_id: userId,
        device_id: deviceId
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete user-device association (unbind device)
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<void>}
   */
  unbind: async (userId, deviceId) => {
    const { error } = await supabase
      .from('user_device')
      .delete()
      .eq('user_id', userId)
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  /**
   * 查詢用戶的所有設備（帶設備詳情和狀態）
   * @param {string} userId - 用戶 ID
   * @returns {Promise<Array>} 設備列表陣列
   */
  findDevicesByUser: async (userId) => {
    const { data, error } = await supabase
      .from('user_device')
      .select(`
        device_id,
        device:device_id (
          device_name,
          language_setting,
          device_status (
            battery_level,
            is_online,
            last_updated
          )
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;

    // 格式化資料
    return data.map(item => ({
      device_id: item.device_id,
      device_name: item.device?.device_name || '未知設備',
      language_setting: item.device?.language_setting || 'en',
      is_online: item.device?.device_status?.[0]?.is_online ?? false,
      battery_level: item.device?.device_status?.[0]?.battery_level ?? '--',
      last_updated: item.device?.device_status?.[0]?.last_updated
    }));
  },

  /**
   * Query all users of a device
   * @param {string} deviceId - Device ID
   * @returns {Promise<Array>} Array of users
   */
  findUsersByDevice: async (deviceId) => {
    const { data, error } = await supabase
      .from('user_device')
      .select(`
        user_id,
        user:user_id (
          user_id,
          username,
          language
        )
      `)
      .eq('device_id', deviceId);

    if (error) throw error;

    return data.map(item => item.user);
  },

  /**
   * 檢查用戶是否擁有該設備
   * @param {string} userId - 用戶 ID
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<boolean>} true 代表擁有
   */
  hasDevice: async (userId, deviceId) => {
    const { data } = await supabase
      .from('user_device')
      .select('device_id')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .maybeSingle();

    return !!data;
  },

  /**
   * 計算用戶擁有的設備數
   * @param {string} userId - 用戶 ID
   * @returns {Promise<number>} 設備數量
   */
  countUserDevices: async (userId) => {
    const { count, error } = await supabase
      .from('user_device')
      .select('device_id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw error;
    return count || 0;
  },

  /**
   * 計算設備的用戶數
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<number>} 用戶數量
   */
  countDeviceUsers: async (deviceId) => {
    const { count, error } = await supabase
      .from('user_device')
      .select('user_id', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    if (error) throw error;
    return count || 0;
  }
};
