// ================== 📊 Supabase 數據庫操作層 ==================
// 所有與 Database 有關嘅操作都寫喺呢度

import { supabase } from './supabaseClient';

export const db = {
  // ============ 👤 用戶相關操作 ============

  // 登入：檢查 username 同 password 係咪匹配
  login: async ({ username, password }) => {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('❌ 登入失敗：帳號或密碼錯誤');
    }
    return data;
  },

  // 註冊：建立新 User
  register: async ({ username, password }) => {
    // 1. 檢查 username 係咪已存在
    const { data: existingUser } = await supabase
      .from('user')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      throw new Error('❌ 用戶名已存在');
    }

    // 2. 建立新 User（ID 用時間戳生成）
    const newUserId = 'usr_' + Date.now();

    const { data, error } = await supabase
      .from('user')
      .insert([{
        user_id: newUserId,
        username: username,
        password: password,
        language: 'en'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 更新用戶 Language 設定
  updateLanguage: async (userId, language) => {
    const { error } = await supabase
      .from('user')
      .update({ language: language })
      .eq('user_id', userId);

    if (error) throw error;
    return { ok: true };
  },

  // 取得使用者資訊
  getUserInfo: async (userId) => {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // ============ 📱 設備相關操作 ============

  // 獲取我嘅所有設備（同時拿到電池、在線狀態）
  getMyDevices: async (userId) => {
    const { data, error } = await supabase
      .from('user_device')
      .select(`
        device_id,
        device:device_id (
          device_name,
          device_status:device_status (
            battery_level,
            is_online
          )
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;

    // 格式化資料
    return data.map(item => ({
      device_id: item.device_id,
      device_name: item.device?.device_name || '未知設備',
      is_online: item.device?.device_status?.[0]?.is_online || false,
      battery_level: item.device?.device_status?.[0]?.battery_level ?? '--'
    }));
  },

  // 綁定設備：建立 Device（如果未存在）→ 綁定 User-Device 關係
  bindDevice: async ({ user_id, device_id, device_name }) => {
    // 1. 檢查 device 係咪已存在，冇就建立
    const { data: existingDevice } = await supabase
      .from('device')
      .select('device_id')
      .eq('device_id', device_id)
      .maybeSingle();

    if (!existingDevice) {
      const { error: insertError } = await supabase
        .from('device')
        .insert([{ device_id, device_name, language_setting: 'en' }]);

      if (insertError) throw insertError;

      // 同時建立 device_status 紀錄
      await supabase
        .from('device_status')
        .insert([{
          device_id,
          battery_level: 100,
          is_online: false
        }]);
    }

    // 2. 綁定 User-Device 關係
    const { error } = await supabase
      .from('user_device')
      .insert([{ user_id, device_id }]);

    if (error) throw error;
    return { ok: true };
  },

  // 解除設備綁定
  removeDevice: async (userId, deviceId) => {
    const { error } = await supabase
      .from('user_device')
      .delete()
      .eq('user_id', userId)
      .eq('device_id', deviceId);

    if (error) throw error;
    return { ok: true };
  },

  // 更新設備名稱
  updateDeviceName: async (deviceId, deviceName) => {
    const { error } = await supabase
      .from('device')
      .update({ device_name: deviceName })
      .eq('device_id', deviceId);

    if (error) throw error;
    return { ok: true };
  },

  // 更新設備狀態（電量、在線狀態）
  updateDeviceStatus: async (deviceId, { battery_level, is_online }) => {
    const { error } = await supabase
      .from('device_status')
      .update({
        battery_level,
        is_online,
        last_updated: new Date().toISOString()
      })
      .eq('device_id', deviceId);

    if (error) throw error;
    return { ok: true };
  },

  // ============ 📜 活動日誌相關操作 ============

  // 獲取設備嘅活動日誌
  getDeviceLogs: async (deviceId, limit = 50) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('time', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  // 新增活動日誌記錄
  addActivityLog: async ({ device_id, activity_type, detected_content, image_url }) => {
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

  // 刪除日誌紀錄
  deleteLog: async (activityId) => {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('activity_id', activityId);

    if (error) throw error;
    return { ok: true };
  }
};
