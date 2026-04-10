// ================== 👤 User 表操作層 ==================
// 所有關於 user 表嘅數據庫操作都寫喺呢度

import { supabase } from '../supabaseClient';

/**
 * User 數據庫服務
 * 負責 user 表的所有 CRUD 操作
 */
export const UserDB = {
  /**
   * 按 username 和 password 查詢用戶
   * @param {string} username - 用戶名
   * @param {string} password - 密碼
   * @returns {Promise<Object>} 用戶對象
   */
  findByUsernameAndPassword: async (username, password) => {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('❌ 用戶名或密碼錯誤');
    }
    return data;
  },

  /**
   * 檢查用戶名是否已存在
   * @param {string} username - 用戶名
   * @returns {Promise<boolean>} true 代表已存在
   */
  existsByUsername: async (username) => {
    const { data } = await supabase
      .from('user')
      .select('user_id')
      .eq('username', username)
      .maybeSingle();

    return !!data;
  },

  /**
   * 建立新用戶
   * @param {Object} userData - 用戶資料 { username, password, language }
   * @returns {Promise<Object>} 新建的用戶對象
   */
  create: async (userData) => {
    const { username, password, language = 'en' } = userData;
    const userId = 'usr_' + Date.now();

    const { data, error } = await supabase
      .from('user')
      .insert([{
        user_id: userId,
        username,
        password,
        language
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 按 ID 查詢用戶
   * @param {string} userId - 用戶 ID
   * @returns {Promise<Object>} 用戶對象
   */
  findById: async (userId) => {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * 更新用戶語言設定
   * @param {string} userId - 用戶 ID
   * @param {string} language - 語言代碼 (en, zh)
   * @returns {Promise<void>}
   */
  updateLanguage: async (userId, language) => {
    const { error } = await supabase
      .from('user')
      .update({ language })
      .eq('user_id', userId);

    if (error) throw error;
  },

  /**
   * 更新用戶資料（通用）
   * @param {string} userId - 用戶 ID
   * @param {Object} updates - 要更新的欄位
   * @returns {Promise<void>}
   */
  update: async (userId, updates) => {
    const { error } = await supabase
      .from('user')
      .update(updates)
      .eq('user_id', userId);

    if (error) throw error;
  },

  /**
   * 刪除用戶賬戶
   * @param {string} userId - 用戶 ID
   * @returns {Promise<void>}
   */
  delete: async (userId) => {
    const { error } = await supabase
      .from('user')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }
};
