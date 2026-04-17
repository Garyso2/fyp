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
   * Query all devices linked to a user, with device details and status
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of device objects
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

    // Flatten nested device data into a flat object
    return data.map(item => ({
      device_id: item.device_id,
      device_name: item.device?.device_name || 'Unknown Device',
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
   * Check whether a user owns a specific device
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<boolean>} true if the user owns the device
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
   * Count how many devices a user owns
   * @param {string} userId - User ID
   * @returns {Promise<number>} Device count
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
   * Count how many users own a specific device
   * @param {string} deviceId - Device ID
   * @returns {Promise<number>} User count
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
