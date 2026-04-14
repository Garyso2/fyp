// ================== 🎯 Fixed Top Navigation Bar ==================

import React from 'react';
import { i18n } from '../i18n';

export const Header = ({ onLogout, user, lang = 'en' }) => {
  const t = i18n[lang] || i18n.en;
  
  return (
    <nav
      className="navbar navbar-dark bg-dark px-4 shadow"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: '60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <span className="navbar-brand mb-0 h5 fw-bold">VisualGuard</span>
      <button onClick={onLogout} className="btn btn-danger btn-sm">
        <i className="bi bi-box-arrow-right me-1"></i>
        {t.logout}
      </button>
    </nav>
  );
};
