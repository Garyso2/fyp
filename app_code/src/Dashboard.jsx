import { useState, useEffect } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';

// 引入我哋拆分好嘅積木 (確保檔案路徑正確)
import { i18n } from './i18n';
import Settings from './components/Settings';
import AddDevice from './components/AddDevice';
import DeviceLogs from './components/DeviceLogs';

const Dashboard = ({ user, onLogout }) => {
  // --- ⚙️ 系統狀態 ---
  const [activeTab, setActiveTab] = useState('devices');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lang, setLang] = useState(user?.language || 'en'); // 預設語言可以跟 User DB
  const [textSize, setTextSize] = useState('medium');
  const t = i18n[lang] || i18n['en']; // 根據選擇嘅語言，載入對應嘅字典

  // --- 📱 裝置狀態 ---
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);

  // --- 🌐 連線 Server 讀取真實裝置名單 ---
  // 當組件載入，或者由 AddDevice 返回 (activeTab 變回 devices) 時觸發
  useEffect(() => {
    const fetchMyDevices = async () => {
      if (!user || !user.user_id) return;
      
      try {
        setIsLoadingDevices(true);
        const response = await fetch(`http://100.125.29.38:8000/api/users/${user.user_id}/devices`, {
          headers: { 'x-api-key': 'yoloProject2026' }
        });
        const data = await response.json();
        
        if (response.ok) {
          // 假設 Server 傳返嘅 Array 叫 devices
          setDevices(data.devices || []); 
        }
      } catch (error) {
        console.error("載入設備名單失敗:", error);
      } finally {
        setIsLoadingDevices(false);
      }
    };

    if (activeTab === 'devices') {
      fetchMyDevices();
    }
  }, [user, activeTab]);

  // --- 🕹️ 控制功能 ---
  // 處理 Menu 轉頁，確保轉頁時清空已選擇嘅裝置同埋收起 Menu
  const handleMenuClick = (tabName) => {
    setActiveTab(tabName);
    setSelectedDevice(null); 
    setIsMenuOpen(false);
  };

  // 控制全局字體大小
  const getFontSize = () => {
    if (textSize === 'small') return '14px';
    if (textSize === 'large') return '20px';
    return '16px';
  };

  return (
    // 根元素套用動態字體大小
    <div className="d-flex flex-column" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#f8f9fa', fontSize: getFontSize() }}>
      
      {/* 🧭 導航欄 Navbar */}
      <nav className="navbar navbar-dark bg-dark px-3 shadow-sm ios-safe-navbar d-flex justify-content-between align-items-center" style={{ zIndex: 1000 }}>
        <div className="d-flex align-items-center">
          {/* 如果唔係首頁，顯示返回按鈕 */}
          {activeTab !== 'devices' && (
            <i className="bi bi-chevron-left text-white me-3 fs-4" onClick={() => handleMenuClick('devices')} style={{cursor: 'pointer'}}></i>
          )}
          <span className="navbar-brand mb-0 h1 fw-bold d-flex align-items-center m-0" onClick={() => handleMenuClick('devices')} style={{cursor: 'pointer'}}>
            <i className="bi bi-eye-fill me-2 fs-3 text-primary"></i>Visual Guard
          </span>
        </div>
        
        {/* 右上角漢堡選單按鈕 */}
        <i className="bi bi-list text-white fs-1" onClick={() => setIsMenuOpen(true)} style={{cursor: 'pointer'}}></i>
      </nav>

      {/* 📱 側邊欄 (Sidebar) */}
      <div className={`position-fixed top-0 start-0 h-100 bg-white shadow-lg transition-transform ${isMenuOpen ? 'translate-middle-x-0' : '-translate-middle-x-100'}`} 
           style={{ width: '280px', zIndex: 1050, transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease-in-out' }}>
        
        <div className="p-4 bg-dark text-white d-flex justify-content-between align-items-center ios-safe-navbar">
          {/* 顯示登入用戶名稱 */}
          <h5 className="mb-0 fw-bold"><i className="bi bi-person-circle me-2"></i>{user?.username || 'User'}</h5>
          <i className="bi bi-x-lg fs-4" onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}}></i>
        </div>
        
        <div className="list-group list-group-flush mt-2">
          <button className={`list-group-item list-group-item-action py-3 fs-5 border-0 ${activeTab === 'devices' ? 'text-primary fw-bold bg-light' : ''}`} onClick={() => handleMenuClick('devices')}>
            <i className="bi bi-phone-fill me-3"></i>{t.myDevices || 'My Devices'}
          </button>
          <button className={`list-group-item list-group-item-action py-3 fs-5 border-0 ${activeTab === 'settings' ? 'text-primary fw-bold bg-light' : ''}`} onClick={() => handleMenuClick('settings')}>
            <i className="bi bi-gear-fill me-3"></i>{t.settings || 'Settings'}
          </button>
          
          {/* 🔴 新增嘅登出按鈕 */}
          <div className="mt-4 border-top pt-2">
            <button className="list-group-item list-group-item-action py-3 fs-5 border-0 text-danger" onClick={onLogout}>
              <i className="bi bi-box-arrow-right me-3"></i>登出 (Logout)
            </button>
          </div>
        </div>
      </div>

      {/* 遮罩層 (點擊側欄以外地方自動關閉) */}
      {isMenuOpen && <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark opacity-50" style={{ zIndex: 1040 }} onClick={() => setIsMenuOpen(false)}></div>}

      {/* 📜 頁面內容區 */}
      <div className="flex-grow-1 p-3 position-relative" style={{ overflowY: 'auto' }}>
        
        {/* --- 頁面 1: My Devices 主頁 (設備列表 或 設備日誌) --- */}
        {activeTab === 'devices' && (
          selectedDevice ? (
            // 🎯 如果有揀中設備，顯示 Logs 組件，並傳入 device 同 t
            <DeviceLogs device={selectedDevice} onBack={() => setSelectedDevice(null)} t={t} />
          ) : (
            // 🎯 顯示主頁設備名單
            <div className="fade-in-animation pb-5">
              <h3 className="mb-4 fw-bold">{t.myDevices || 'My Devices'}</h3>
              
              {/* 動態渲染 Devices */}
              {isLoadingDevices ? (
                <div className="text-center mt-5"><div className="spinner-border text-primary"></div></div>
              ) : devices.length === 0 ? (
                <div className="text-center mt-5 text-muted">
                  <i className="bi bi-box-seam fs-1 d-block mb-3"></i>
                  <p>您尚未綁定任何裝置，請點擊右下角「+」新增。</p>
                </div>
              ) : (
                devices.map((dev) => (
                  <div key={dev.device_id} className="card border-0 shadow-sm rounded-4 mb-3" onClick={() => setSelectedDevice(dev)} style={{cursor: 'pointer'}}>
                     <div className="card-body d-flex align-items-center p-3">
                        <div className="bg-light rounded-circle p-3 me-3">
                          {/* 根據上線狀態轉顏色 */}
                          <i className={`bi bi-camera-video ${dev.is_online ? 'text-success' : 'text-secondary'} fs-3`}></i>
                        </div>
                        <div className="flex-grow-1">
                           <h6 className="fw-bold mb-1">{dev.device_name}</h6>
                           <small className="text-muted d-block">
                             <span className={`badge ${dev.is_online ? 'bg-success' : 'bg-secondary'} me-2`}>
                               {dev.is_online ? 'Online' : 'Offline'}
                             </span>
                             Battery: {dev.battery_level !== undefined ? `${dev.battery_level}%` : '--'}
                           </small>
                        </div>
                     </div>
                  </div>
                ))
              )}
              
              {/* 懸浮添加按鈕 */}
              <button onClick={() => handleMenuClick('add_device')} className="btn btn-primary shadow-lg d-flex justify-content-center align-items-center" style={{ position: 'fixed', bottom: '30px', right: '30px', width: '60px', height: '60px', borderRadius: '50%', fontSize: '26px', zIndex: 900 }}>
                 <i className="bi bi-plus-lg"></i>
              </button>
            </div>
          )
        )}

        {/* --- 頁面 2: Settings 設定頁面 --- */}
        {/* 記得將 user 傳入 Settings，等佢可以 Update DB */}
        {activeTab === 'settings' && <Settings user={user} t={t} lang={lang} setLang={setLang} textSize={textSize} setTextSize={setTextSize} />}

        {/* --- 頁面 3: Add Device 藍牙配網頁面 --- */}
        {/* 記得將 user 傳入 AddDevice，等佢綁定時知道係邊個 user */}
        {activeTab === 'add_device' && <AddDevice user={user} t={t} goBack={() => handleMenuClick('devices')} />}

      </div>
    </div>
  )
}

export default Dashboard;