// ================== ⚙️ Settings Page ==================

import React, { useState } from 'react';
import { i18n } from '../i18n';
import { UserService } from '../functions/user.functions';

export const SettingsPage = ({ user, lang, setLang, textSize, setTextSize }) => {
  const [tempLang, setTempLang] = useState(lang);
  const [tempTextSize, setTempTextSize] = useState(textSize);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showMessage, setShowMessage] = useState(false);

  // Use translation dictionary from i18n.js
  const t = i18n[lang] || i18n.en;

  const handleLanguageChange = (newLang) => {
    setTempLang(newLang);
  };

  const handleTextSizeChange = (newSize) => {
    setTempTextSize(newSize);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    setShowMessage(true);

    try {
      // Save language setting to database
      if (user?.user_id && tempLang !== lang) {
        const result = await UserService.updateLanguage(user.user_id, tempLang);
        if (!result.ok) {
          throw new Error(result.message);
        }
      }

      // Update frontend state
      if (tempLang !== lang) {
        setLang(tempLang);
      }
      if (tempTextSize !== textSize) {
        setTextSize(tempTextSize);
      }

      setSaveMessage(t.saved);
      setTimeout(() => {
        setShowMessage(false);
      }, 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage(t.saveFailed || '❌ 保存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setTempLang(lang);
    setTempTextSize(textSize);
    setSaveMessage('');
    setShowMessage(false);
  };

  const hasChanges = tempLang !== lang || tempTextSize !== textSize;

  return (
    <div className="pb-5">
      <h3 className="mb-4 fw-bold">{t.settings}</h3>

      {/* Alert Message */}
      {showMessage && (
        <div className={`alert ${saveMessage.includes('✅') ? 'alert-success' : 'alert-danger'} alert-dismissible fade show`} role="alert">
          {saveMessage}
          <button
            type="button"
            className="btn-close"
            onClick={() => setShowMessage(false)}
          ></button>
        </div>
      )}

      {/* User Info Card */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary text-white rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '60px', height: '60px', fontSize: '30px' }}>
            <i className="bi bi-person"></i>
          </div>
          <div>
            <h5 className="fw-bold mb-1">{user?.username || 'Unknown'}</h5>
            <p className="text-muted mb-0">ID: {user?.user_id || '-----'}</p>
          </div>
        </div>
      </div>

      {/* Language Setting */}
      <div className="card border-0 shadow-sm rounded-4 mb-3">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-globe me-2 text-primary"></i>
            {t.lang}
          </h6>
          <select
            className="form-select form-select-lg border-0 bg-light"
            value={tempLang}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="en">English</option>
            <option value="zh">繁體中文</option>
          </select>
        </div>
      </div>

      {/* Text Size */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3">
            <i className="bi bi-text-center me-2 text-primary"></i>
            {t.textSize}
          </h6>
          <div className="btn-group w-100">
            {[
              { value: 'small', label: t.small },
              { value: 'medium', label: t.medium },
              { value: 'large', label: t.large }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleTextSizeChange(value)}
                className={`btn ${tempTextSize === value ? 'btn-primary' : 'btn-outline-primary'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save Buttons */}
      {hasChanges && (
        <div className="d-flex gap-2 mb-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary btn-lg flex-grow-1"
          >
            {isSaving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                {t.saving}
              </>
            ) : (
              <>
                <i className="bi bi-check-circle me-2"></i>
                {t.save}
              </>
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="btn btn-outline-secondary btn-lg flex-grow-1"
          >
            <i className="bi bi-x-circle me-2"></i>
            {t.cancel}
          </button>
        </div>
      )}
    </div>
  );
};
