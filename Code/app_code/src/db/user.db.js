// ================== 👤 User Table Operation Layer ==================
// All database operations for user table are written here

import { supabase } from '../supabaseClient';

/**
 * User Database Service
 * Responsible for all CRUD operations on user table
 */
export const UserDB = {
  /**
   * Query user by username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} User object
   */
  findByUsernameAndPassword: async (username, password) => {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('❌ Invalid username or password');
    }
    return data;
  },

  /**
   * Check if username already exists
   * @param {string} username - Username
   * @returns {Promise<boolean>} true if exists
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
   * Generate the next user ID in format U001, U002, ...
   * Queries all existing IDs and increments the highest numeric one
   * @returns {Promise<string>} e.g. "U003"
   */
  getNextUserId: async () => {
    const { data } = await supabase
      .from('user')
      .select('user_id');

    let max = 0;
    if (data) {
      for (const row of data) {
        const match = row.user_id?.match(/^U(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    }
    const next = max + 1;
    return 'U' + String(next).padStart(3, '0');
  },

  /**
   * Create new user
   * @param {Object} userData - User data { username, password, language }
   * @returns {Promise<Object>} Newly created user object
   */
  create: async (userData) => {
    const { username, password, language = 'en' } = userData;
    const userId = await UserDB.getNextUserId();

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
   * Query user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User object
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
   * Update user language setting
   * @param {string} userId - User ID
   * @param {string} language - Language code (en, zh)
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
   * Update user fields (generic)
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
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
   * Delete a user account
   * @param {string} userId - User ID
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
