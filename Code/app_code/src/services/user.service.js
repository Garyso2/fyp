// ================== User Service (Business Logic Layer) ==================
// Handles all user-related business processes: login, registration,
// profile updates. Calls UserDB for all database operations.

import { UserDB } from '../db/user.db';

export const UserService = {
  /**
   * User login flow
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{status, user?, message}>}
   */
  login: async (username, password) => {
    try {
      if (!username || !password) {
        return { status: 'error', message: '❌ Username and password cannot be empty' };
      }

      const user = await UserDB.findByUsernameAndPassword(username, password);
      return { status: 'success', user, message: '✅ Login successful' };
    } catch (error) {
      console.error('Login failed:', error);
      return { status: 'error', message: error.message || '❌ Login failed' };
    }
  },

  /**
   * User registration flow — validates input, checks uniqueness, creates account
   * @param {string} username
   * @param {string} password
   * @param {string} confirmPassword
   * @returns {Promise<{status, user?, message}>}
   */
  register: async (username, password, confirmPassword) => {
    try {
      if (!username || !password) {
        return { status: 'error', message: '❌ Username and password cannot be empty' };
      }
      if (password !== confirmPassword) {
        return { status: 'error', message: '❌ Passwords do not match' };
      }
      if (password.length < 6) {
        return { status: 'error', message: '❌ Password must be at least 6 characters' };
      }

      const exists = await UserDB.existsByUsername(username);
      if (exists) {
        return { status: 'error', message: '❌ Username already in use' };
      }

      const user = await UserDB.create({ username, password, language: 'en' });
      return { status: 'success', user, message: '✅ Registration successful, please login' };
    } catch (error) {
      console.error('Registration failed:', error);
      return { status: 'error', message: error.message || '❌ Registration failed' };
    }
  },

  /**
   * Update the user's preferred language and persist to database
   * @param {string} userId
   * @param {string} language - Language code: 'en' | 'zh'
   * @returns {Promise<{ok, message}>}
   */
  updateLanguage: async (userId, language) => {
    try {
      await UserDB.updateLanguage(userId, language);
      return { ok: true, message: '✅ Language updated' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  },

  /**
   * Fetch full user profile by ID
   * @param {string} userId
   * @returns {Promise<{ok, user?, message}>}
   */
  getUserInfo: async (userId) => {
    try {
      const user = await UserDB.findById(userId);
      return { ok: true, user, message: '✅ User info retrieved' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
};
