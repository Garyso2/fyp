import React, { useState } from 'react';

// 🎯 接收多咗 t, lang, setLang 作為 Props
const Login = ({ onLoginSuccess, t = {}, lang = 'en', setLang }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); 
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    if (!username || !password) {
      setErrorMsg(t.enterCredentials || 'Please enter username and password!');
      setIsLoading(false);
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setErrorMsg(t.pwdMismatch || 'Passwords do not match, please try again!');
      setIsLoading(false);
      return;
    }

    // 🚨 開發者專用：Admin 後門捷徑
    if (!isRegisterMode && username === 'admin' && password === 'admin') {
      console.warn("⚠️ 使用 Admin 開發者後門登入");
      onLoginSuccess({ 
        user_id: 'admin_999', 
        username: 'Super Admin', 
        language: lang 
      });
      return; 
    }

    try {
      const endpoint = isRegisterMode ? '/api/register' : '/api/login';
      const response = await fetch(`http://100.125.29.38:8000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'yoloProject2026' 
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        if (isRegisterMode) {
          setIsRegisterMode(false);
          setSuccessMsg(t.registerSuccess || 'Registration successful! Please login.');
          setPassword(''); 
          setConfirmPassword('');
        } else {
          onLoginSuccess(data.user); 
        }
      } else {
        setErrorMsg(data.message || (isRegisterMode ? (t.registerFail || 'Registration failed.') : (t.loginFail || 'Login failed.')));
      }
    } catch (error) {
      console.error("連線錯誤:", error);
      setErrorMsg(t.networkError || 'Cannot connect to server.');
    } finally {
      setIsLoading(false);
    }
  };

  // 切換語言功能
  const toggleLanguage = () => {
    if (setLang) {
      setLang(lang === 'en' ? 'zh' : 'en');
    }
  };

  return (
    <div 
      className="d-flex justify-content-center align-items-center vh-100 vw-100 fade-in-animation position-relative"
      style={{ background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' }}
    >
      {/* 🌐 右上角語言切換按鈕 */}
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
            <h2 className="fw-bold mt-2">{isRegisterMode ? (t.createAccount || 'Create Account') : 'VisualGuard'}</h2>
            <p className="text-muted">{isRegisterMode ? (t.registerDesc || 'Please fill in details to register') : (t.loginDesc || 'Please login to connect to your system')}</p>
          </div>

          {errorMsg && (
            <div className="alert alert-danger py-2" role="alert">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="alert alert-success py-2 fade-in-animation" role="alert">
              <i className="bi bi-check-circle-fill me-2"></i>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-bold">{t.username || 'Username / Email'}</label>
              <div className="input-group input-group-lg">
                <span className="input-group-text bg-white border-end-0">
                  <i className="bi bi-person text-muted"></i>
                </span>
                <input 
                  type="text" 
                  className="form-control border-start-0 ps-0" 
                  placeholder={t.enterUsername || "Enter username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">{t.password || 'Password'}</label>
              <div className="input-group input-group-lg">
                <span className="input-group-text bg-white border-end-0">
                  <i className="bi bi-lock text-muted"></i>
                </span>
                <input 
                  type="password" 
                  className="form-control border-start-0 ps-0" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {isRegisterMode && (
              <div className="mb-4 fade-in-animation">
                <label className="form-label fw-bold">{t.confirmPassword || 'Confirm Password'}</label>
                <div className="input-group input-group-lg">
                  <span className="input-group-text bg-white border-end-0">
                    <i className="bi bi-lock-fill text-muted"></i>
                  </span>
                  <input 
                    type="password" 
                    className="form-control border-start-0 ps-0" 
                    placeholder={t.enterPasswordAgain || "Enter password again"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary btn-lg w-100 rounded-pill fw-bold shadow-sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              ) : (
                <i className={`bi ${isRegisterMode ? 'bi-person-plus-fill' : 'bi-box-arrow-in-right'} me-2`}></i>
              )}
              {isLoading ? (t.processing || 'Processing...') : (isRegisterMode ? (t.registerBtn || 'Register') : (t.loginBtn || 'Login'))}
            </button>
          </form>

          <div className="text-center mt-3">
            <span className="text-muted">
              {isRegisterMode ? (t.hasAccount || 'Already have an account?') : (t.noAccount || "Don't have an account?")}
            </span>
            <button 
              type="button" 
              className="btn btn-link text-decoration-none fw-bold p-0 ms-1"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setErrorMsg('');
                setSuccessMsg('');
                setPassword('');
                setConfirmPassword('');
              }}
            >
              {isRegisterMode ? (t.backToLogin || 'Back to Login') : (t.registerNow || 'Register Now')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;