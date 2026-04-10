import React from 'react';
const Settings = ({ user, t, lang, setLang, textSize, setTextSize }) => {
  // 防呆機制：確保 t (翻譯物件) 存在，如果冇就用空物件代替，防止 crash
  const text = t || {};
  
  console.log('🔧 Settings 組件已載入');
  console.log('User:', user);
  console.log('Translation object:', text);
  console.log('Lang:', lang);
  console.log('TextSize:', textSize);

  return (
    <div className="fade-in-animation pb-5" style={{ minHeight: '100%', backgroundColor: '#fff' }}>
      <h3 className="mb-4 fw-bold">{text.settings || '設定 (Settings)'}</h3>

      {/* 👤 使用者資訊卡片 */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-4 d-flex align-items-center">
          <div 
            className="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center me-3" 
            style={{ width: '60px', height: '60px', fontSize: '30px' }}
          >
            <i className="bi bi-person"></i>
          </div>
          <div>
            <h5 className="fw-bold mb-1">{user?.username || '未知使用者'}</h5>
            <p className="text-muted mb-0">ID: {user?.user_id || '-----'}</p>
          </div>
        </div>
      </div>

      {/* 🌐 語言設定 */}
      <div className="card border-0 shadow-sm rounded-4 mb-3">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-globe me-2 text-primary"></i>
            {text.lang || '語言 (Language)'}
          </h6>
          <select 
            className="form-select form-select-lg border-0 bg-light"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{ cursor: 'pointer' }}
          >
            <option value="en">English</option>
            <option value="zh">繁體中文</option>
          </select>
        </div>
      </div>

      {/* 🔠 字體大小設定 */}
      <div className="card border-0 shadow-sm rounded-4 mb-3">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-type me-2 text-primary"></i>
            {text.textSize || '字體大小 (Text Size)'}
          </h6>
          <div className="d-flex gap-2">
            <button 
              className={`btn flex-fill ${textSize === 'small' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
              onClick={() => setTextSize('small')}
            >
              小 (Small)
            </button>
            <button 
              className={`btn flex-fill ${textSize === 'medium' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
              onClick={() => setTextSize('medium')}
            >
              中 (Medium)
            </button>
            <button 
              className={`btn flex-fill ${textSize === 'large' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
              onClick={() => setTextSize('large')}
            >
              大 (Large)
            </button>
          </div>
        </div>
      </div>

      {/* ℹ️ 系統資訊 (選填) */}
      <div className="text-center mt-4 text-muted" style={{ fontSize: '12px' }}>
        <p>Visual Guard App v1.0.0</p>
      </div>

    </div>
  );
};

export default Settings;