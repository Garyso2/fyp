import React, { useState } from 'react';

// 1. 記得喺 Props 度接收返 user
const Settings = ({ user, t, lang, setLang, textSize, setTextSize }) => {
  // 記錄是否正在儲存，以及儲存成功嘅提示訊息
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // 2. 升級版「轉語言」功能 (連線 Database)
  const handleLanguageChange = async (e) => {
    const newLang = e.target.value;
    
    // A. 畫面即時轉語言 (UX 最緊要快)
    setLang(newLang);

    // 防呆：如果冇 user 資料就唔 Call API
    if (!user || !user.user_id) return;

    // B. 背景連線 Server 寫入 DB
    try {
      setIsSaving(true);
      setSaveMessage('');
      
      const response = await fetch(`http://100.125.29.38:8000/api/users/${user.user_id}/language`, {
        method: 'PUT', // 更新資料通常用 PUT
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'yoloProject2026'
        },
        body: JSON.stringify({ language: newLang })
      });

      if (response.ok) {
        console.log("✅ 語言設定已同步至 Database");
        // 顯示 3 秒鐘嘅成功提示
        setSaveMessage('設定已同步儲存至雲端！');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        console.warn("⚠️ 伺服器拒絕咗更新請求");
      }
    } catch (error) {
      console.error("❌ 連接伺服器失敗:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = () => alert(t.pwdResetMsg);

  return (
    <div className="fade-in-animation">
      <h3 className="mb-4 fw-bold">{t.settings}</h3>
      
      {/* 儲存成功嘅綠色提示框 */}
      {saveMessage && (
        <div className="alert alert-success py-2 fade-in-animation shadow-sm" role="alert">
          <i className="bi bi-check-circle-fill me-2"></i>{saveMessage}
        </div>
      )}

      <div className="card shadow-sm border-0 mb-4 rounded-4">
        <div className="card-body p-4">
          
          <div className="mb-4">
            <label className="form-label fw-bold text-muted d-flex align-items-center">
              <i className="bi bi-globe me-2"></i>{t.lang}
              {/* 如果 Saving 緊，顯示一個極細嘅轉圈圈 */}
              {isSaving && <div className="spinner-border spinner-border-sm text-primary ms-3"></div>}
            </label>
            {/* 呢度將 onChange 換成我哋新寫嘅 handleLanguageChange */}
            <select className="form-select form-select-lg" value={lang} onChange={handleLanguageChange}>
              <option value="en">English</option>
              <option value="zh">繁體中文</option>
            </select>
          </div>
          
          <div className="mb-4">
            <label className="form-label fw-bold text-muted"><i className="bi bi-type me-2"></i>{t.textSize}</label>
            {/* 字體大小暫時只喺 App 端生效，所以照舊 */}
            <select className="form-select form-select-lg" value={textSize} onChange={(e) => setTextSize(e.target.value)}>
              <option value="small">{t.small}</option>
              <option value="medium">{t.medium}</option>
              <option value="large">{t.large}</option>
            </select>
          </div>
          
          <hr className="my-4"/>
          
          <button onClick={handleResetPassword} className="btn btn-outline-danger btn-lg w-100 rounded-pill fw-bold">
            <i className="bi bi-shield-lock me-2"></i>{t.resetPwd}
          </button>
          
        </div>
      </div>
    </div>
  );
}

export default Settings;