// ================== 👤 User Business Logic Layer ==================
// All business logic related to user authentication, login, and registration is here

import { UserDB } from '../db/user.db';

/**
 * User Service (Business Logic)
 * Handles user-related business processes
 */
export const UserService = {
  /**
   * User login flow
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} { status, user, message }
   */
  login: async (username, password) => {
    try {
      // Validation
      if (!username || !password) {
        return {
          status: 'error',
          message: '❌ Username and password cannot be empty'
        };
      }

      // Query database
      const user = await UserDB.findByUsernameAndPassword(username, password);

      return {
        status: 'success',
        user,
        message: '✅ Login successful'
      };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        status: 'error',
        message: error.message || '❌ Login failed'
      };
    }
  },

  /**
   * User registration flow
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} confirmPassword - Confirm password
   * @returns {Promise<Object>} { status, user, message }
   */
  register: async (username, password, confirmPassword) => {
    try {
      // Validation
      if (!username || !password) {
        return {
          status: 'error',
          message: '❌ Username and password cannot be empty'
        };
      }

      if (password !== confirmPassword) {
        return {
          status: 'error',
          message: '❌ Passwords do not match'
        };
      }

      if (password.length < 6) {
        return {
          status: 'error',
          message: '❌ Password must be at least 6 characters'
        };
      }

      // Check if username already exists
      const exists = await UserDB.existsByUsername(username);
      if (exists) {
        return {
          status: 'error',
          message: '❌ Username already in use'
        };
      }

      // Create new user
      const user = await UserDB.create({
        username,
        password,
        language: 'en'
      });

      return {
        status: 'success',
        user,
        message: '✅ Registration successful, please login'
      };
    } catch (error) {
      console.error('Registration failed:', error);
      return {
        status: 'error',
        message: error.message || '❌ Registration failed'
      };
    }
  },

  /**
   * Admin 開發者後門
   * @param {string} username - 用戶名
   * @param {string} password - 密碼
   * @returns {Object|null} 後門賬號或 null
   */
  checkAdminBackdoor: (username, password) => {
    if (username === 'admin' && password === 'admin') {
      return {
        user_id: 'admin_999',
        username: 'Super Admin',
        language: 'en'
      };
    }
    return null;
  },

  /**
   * 更新用戶語言設定
   * @param {string} userId - 用戶 ID
   * @param {string} language - 語言代碼 (en, zh)
   * @returns {Promise<Object>} { ok, message }
   */
  updateLanguage: async (userId, language) => {
    try {
      await UserDB.updateLanguage(userId, language);
      return {
        ok: true,
        message: '✅ 語言已更新'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  },

  /**
   * 獲取用戶詳細資訊
   * @param {string} userId - 用戶 ID
   * @returns {Promise<Object>} { ok, user, message }
   */
  getUserInfo: async (userId) => {
    try {
      const user = await UserDB.findById(userId);
      return {
        ok: true,
        user,
        message: '✅ 已取得用戶資訊'
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message
      };
    }
  }
};
