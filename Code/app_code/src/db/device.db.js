// ================== 📱 Device 和 device_status 表操作層 ==================
// 所有關於 device 和 device_status 表嘅數據庫操作都寫喺呢度

import { supabase } from '../supabaseClient';

/**
 * Device 數據庫服務
 * 負責 device 和 device_status 表的所有 CRUD 操作
 */
export const DeviceDB = {
  /**
   * 按 device_id 查詢設備
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} 設備對象
   */
  findById: async (deviceId) => {
    const { data, error } = await supabase
      .from('device')
      .select(`
        *,
        device_status (
          battery_level,
          is_online,
          last_updated
        )
      `)
      .eq('device_id', deviceId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 檢查設備是否存在
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<boolean>} true 代表存在
   */
  exists: async (deviceId) => {
    const { data } = await supabase
      .from('device')
      .select('device_id')
      .eq('device_id', deviceId)
      .maybeSingle();

    return !!data;
  },

  /**
   * 建立新設備
   * @param {Object} deviceData - 設備資料 { device_id, device_name, language_setting }
   * @returns {Promise<Object>} 新建的設備對象
   */
  create: async (deviceData) => {
    const { device_id, device_name, language_setting = 'en' } = deviceData;

    const { data, error } = await supabase
      .from('device')
      .insert([{
        device_id,
        device_name,
        language_setting
      }])
      .select()
      .single();

    if (error) throw error;

    // 同時建立 device_status 紀錄
    await DeviceDB.createStatus({
      device_id,
      battery_level: 100,
      is_online: false
    });

    return data;
  },

  /**
   * 更新設備名稱
   * @param {string} deviceId - 設備 ID
   * @param {string} deviceName - 新設備名稱
   * @returns {Promise<void>}
   */
  updateName: async (deviceId, deviceName) => {
    const { error } = await supabase
      .from('device')
      .update({ device_name: deviceName })
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  /**
   * 更新設備語言設定
   * @param {string} deviceId - 設備 ID
   * @param {string} languageSetting - 語言代碼
   * @returns {Promise<void>}
   */
  updateLanguageSetting: async (deviceId, languageSetting) => {
    const { error } = await supabase
      .from('device')
      .update({ language_setting: languageSetting })
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  /**
   * 刪除設備
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<void>}
   */
  delete: async (deviceId) => {
    // 先刪除 device_status
    await DeviceDB.deleteStatus(deviceId);

    // 再刪除 device
    const { error } = await supabase
      .from('device')
      .delete()
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  // ============ device_status 相關 ============

  /**
   * 建立設備狀態記錄
   * @param {Object} statusData - 狀態資料 { device_id, battery_level, is_online }
   * @returns {Promise<Object>} 新建的狀態對象
   */
  createStatus: async (statusData) => {
    const { device_id, battery_level = 0, is_online = false } = statusData;

    const { data, error } = await supabase
      .from('device_status')
      .insert([{
        device_id,
        battery_level,
        is_online,
        last_updated: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 查詢設備的當前狀態
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<Object>} 狀態對象 { battery_level, is_online, last_updated }
   */
  getStatus: async (deviceId) => {
    const { data, error } = await supabase
      .from('device_status')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 更新設備狀態（電量、在線狀態）
   * @param {string} deviceId - 設備 ID
   * @param {Object} statusUpdate - 狀態更新 { battery_level, is_online }
   * @returns {Promise<void>}
   */
  updateStatus: async (deviceId, statusUpdate) => {
    const { battery_level, is_online } = statusUpdate;

    const { error } = await supabase
      .from('device_status')
      .update({
        battery_level,
        is_online,
        last_updated: new Date().toISOString()
      })
      .eq('device_id', deviceId);

    if (error) throw error;
  },

  /**
   * 刪除設備狀態
   * @param {string} deviceId - 設備 ID
   * @returns {Promise<void>}
   */
  deleteStatus: async (deviceId) => {
    const { error } = await supabase
      .from('device_status')
      .delete()
      .eq('device_id', deviceId);

    if (error) throw error;
  }
};
