// ================== 👤 User 業務邏輯層 ==================
// 所有關於用戶認證、登入、註冊的業務邏輯都在這裡

import { UserDB } from '../db/user.db';

/**
 * User 服務（業務邏輯）
 * 處理用戶相關的業務流程
 */
export const UserService = {
  /**
   * 用戶登入流程
   * @param {string} username - 用戶名
   * @param {string} password - 密碼
   * @returns {Promise<Object>} { status, user, message }
   */
  login: async (username, password) => {
    try {
      // 防呆
      if (!username || !password) {
        return {
          status: 'error',
          message: '❌ 用戶名和密碼不能為空'
        };
      }

      // 查詢數據庫
      const user = await UserDB.findByUsernameAndPassword(username, password);

      return {
        status: 'success',
        user,
        message: '✅ 登入成功'
      };
    } catch (error) {
      console.error('登入失敗:', error);
      return {
        status: 'error',
        message: error.message || '❌ 登入失敗'
      };
    }
  },

  /**
   * 用戶註冊流程
   * @param {string} username - 用戶名
   * @param {string} password - 密碼
   * @param {string} confirmPassword - 確認密碼
   * @returns {Promise<Object>} { status, user, message }
   */
  register: async (username, password, confirmPassword) => {
    try {
      // 防呆檢驗
      if (!username || !password) {
        return {
          status: 'error',
          message: '❌ 用戶名和密碼不能為空'
        };
      }

      if (password !== confirmPassword) {
        return {
          status: 'error',
          message: '❌ 密碼不匹配'
        };
      }

      if (password.length < 6) {
        return {
          status: 'error',
          message: '❌ 密碼長度至少 6 位'
        };
      }

      // 檢查用戶名是否已存在
      const exists = await UserDB.existsByUsername(username);
      if (exists) {
        return {
          status: 'error',
          message: '❌ 用戶名已被使用'
        };
      }

      // 建立新用戶
      const user = await UserDB.create({
        username,
        password,
        language: 'en'
      });

      return {
        status: 'success',
        user,
        message: '✅ 註冊成功，請登入'
      };
    } catch (error) {
      console.error('註冊失敗:', error);
      return {
        status: 'error',
        message: error.message || '❌ 註冊失敗'
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
