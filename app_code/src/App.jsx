import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './Dashboard';
import { i18n } from './i18n'; // 👈 記得引入字典

const App = () => {
  const [user, setUser] = useState(null);
  
  // 將語言狀態提升到 App 層級，等 Login 同 Dashboard 都可以共用
  const [lang, setLang] = useState('zh'); 
  const t = i18n[lang] || i18n['en'];

  if (!user) {
    // 傳入 t, lang, setLang 俾 Login
    return <Login onLoginSuccess={(userData) => setUser(userData)} t={t} lang={lang} setLang={setLang} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
};

export default App;