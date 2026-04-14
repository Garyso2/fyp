// ================== 🔐 Login/Register Page ==================

import React, { useState } from 'react';
import { i18n } from '../i18n';
import { UserService } from '../functions/user.functions';

export const LoginPage = ({ onLoginSuccess, lang, setLang }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Use translations from i18n.js
  const t = i18n[lang] || i18n.en;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    // Check admin backdoor
    const adminUser = UserService.checkAdminBackdoor(username, password);
    if (adminUser) {
      onLoginSuccess(adminUser);
      return;
    }

    // Normal flow
    const result = isRegisterMode
      ? await UserService.register(username, password, confirmPassword)
      : await UserService.login(username, password);

    if (result.status === 'success') {
      if (isRegisterMode) {
        setIsRegisterMode(false);
        setSuccessMsg(result.message);
        setPassword('');
        setConfirmPassword('');
      } else {
        onLoginSuccess(result.user);
      }
    } else {
      setErrorMsg(result.message);
    }

    setIsLoading(false);
  };

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'zh' : 'en');
  };

  return (
    <div
      className="d-flex justify-content-center align-items-center vh-100 vw-100 position-relative"
      style={{ background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' }}
    >
      <div className="position-absolute top-0 end-0 p-4">
        <button onClick={toggleLanguage} className="btn btn-light rounded-pill shadow-sm fw-bold px-3">
          <i className="bi bi-globe me-2"></i>
          {lang === 'en' ? '繁體中文' : 'English'}
        </button>
      </div>

      <div className="card shadow-lg border-0 rounded-4" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <i className={`bi ${isRegisterMode ? 'bi-person-plus' : 'bi-shield-check'} text-primary`} style={{ fontSize: '4rem' }}></i>
            <h2 className="fw-bold mt-2">{isRegisterMode ? t.createAccount : 'VisualGuard'}</h2>
          </div>

          {errorMsg && <div className="alert alert-danger" role="alert">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success" role="alert">{successMsg}</div>}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-bold">{t.username}</label>
              <input
                type="text"
                className="form-control form-control-lg border-0 bg-light"
                placeholder={t.username}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">{t.password}</label>
              <input
                type="password"
                className="form-control form-control-lg border-0 bg-light"
                placeholder={t.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isRegisterMode && (
              <div className="mb-3">
                <label className="form-label fw-bold">{t.confirmPwd}</label>
                <input
                  type="password"
                  className="form-control form-control-lg border-0 bg-light"
                  placeholder={t.confirmPwd}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg w-100 fw-bold rounded-pill"
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  {t.loading}
                </>
              ) : (
                isRegisterMode ? t.register : t.login
              )}
            </button>
          </form>

          <hr className="my-4" />

          <div className="text-center">
            <p className="text-muted mb-0">
              {isRegisterMode ? t.haveAccount : t.noAccount}
              <button
                type="button"
                className="btn btn-link text-primary p-0 text-decoration-none fw-bold"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
              >
                {isRegisterMode ? t.login : t.register}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
