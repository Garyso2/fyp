import { useState, useEffect } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';

// 引入積木
import { i18n } from '../i18n';
import Settings from './Settings';
import AddDevice from './AddDevice';
import DeviceLogs from './DeviceLogs';

// 🎯 確保你有建立這個檔案並匯出 supabase client
import { supabase } from '../supabaseClient';

const Dashboard = ({ user, onLogout }) => {
  // --- ⚙️ 系統狀態 ---
  const [activeTab, setActiveTab] = useState('devices');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lang, setLang] = useState(user?.language || 'en'); 
  const [textSize, setTextSize] = useState('medium');
  const t = i18n[lang] || i18n['en'];

  console.log('📱 Dashboard activeTab:', activeTab);

  // --- 📱 裝置狀態 ---
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);

  // --- 🌐 使用 Supabase 讀取真實裝置名單 ---
  useEffect(() => {
    const fetchMyDevices = async () => {
      if (!user || !user.user_id) return;
      
      try {
        setIsLoadingDevices(true);

        // 🎯 Supabase 聯表查詢邏輯：
        // 1. 從 user_device 開始搵屬於呢個 user_id 嘅紀錄
        // 2. 透過外鍵抓取 device 表嘅 device_name
        // 3. 再透過 device 表抓取對應嘅 device_status (電量、是否在線)
        const { data, error } = await supabase
          .from('user_device')
          .select(`
            device_id,
            device:device_id (
              device_name,
              device_status:device_status (
                battery_level,
                is_online
              )
            )
          `)
          .eq('user_id', user.user_id);

        if (error) throw error;

        // 整理資料結構，等佢變返原本 UI 用開嘅樣
        const formattedDevices = data.map(item => ({
          device_id: item.device_id,
          device_name: item.device?.device_name || '未知設備',
          is_online: item.device?.device_status?.[0]?.is_online || false, // 注意：如果是一對一，Supabase 有時會回傳 Array
          battery_level: item.device?.device_status?.[0]?.battery_level ?? '--'
        }));

        setDevices(formattedDevices);

      } catch (error) {
        console.error("Supabase 載入設備失敗:", error.message);
      } finally {
        setIsLoadingDevices(false);
      }
    };

    if (activeTab === 'devices') {
      fetchMyDevices();
    }
  }, [user, activeTab]);

  // --- 🕹️ 控制功能 ---
  const handleMenuClick = (tabName) => {
    setActiveTab(tabName);
    setSelectedDevice(null); 
    setIsMenuOpen(false);
  };

  const getFontSize = () => {
    if (textSize === 'small') return '14px';
    if (textSize === 'large') return '20px';
    return '16px';
  };

  return (
    <div className="d-flex flex-column" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#f8f9fa', fontSize: getFontSize() }}>
      
      {/* 🧭 Navbar */}
      <nav className="navbar navbar-dark bg-dark px-3 shadow-sm d-flex justify-content-between align-items-center" style={{ zIndex: 1000 }}>
        <div className="d-flex align-items-center">
          {activeTab !== 'devices' && (
            <i className="bi bi-chevron-left text-white me-3 fs-4" onClick={() => handleMenuClick('devices')} style={{cursor: 'pointer'}}></i>
          )}
          <span className="navbar-brand mb-0 h1 fw-bold d-flex align-items-center m-0" onClick={() => handleMenuClick('devices')} style={{cursor: 'pointer'}}>
            <i className="bi bi-eye-fill me-2 fs-3 text-primary"></i>Visual Guard
          </span>
        </div>
        <i className="bi bi-list text-white fs-1" onClick={() => setIsMenuOpen(true)} style={{cursor: 'pointer'}}></i>
      </nav>

      {/* 📱 Sidebar */}
      <div className={`position-fixed top-0 start-0 h-100 bg-white shadow-lg`} 
           style={{ 
             width: '280px', 
             zIndex: 1050, 
             transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)', 
             transition: 'transform 0.3s ease-in-out' 
           }}>
        
        <div className="p-4 bg-dark text-white d-flex justify-content-between align-items-center">
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
          <div className="mt-4 border-top pt-2">
            <button className="list-group-item list-group-item-action py-3 fs-5 border-0 text-danger" onClick={onLogout}>
              <i className="bi bi-box-arrow-right me-3"></i>登出 (Logout)
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark opacity-50" style={{ zIndex: 1040 }} onClick={() => setIsMenuOpen(false)}></div>}

      {/* 📜 內容區 */}
      <div className="flex-grow-1 p-3" style={{ overflowY: 'auto' }}>
        {activeTab === 'devices' && (
          selectedDevice ? (
            <DeviceLogs user={user} device={selectedDevice} onBack={() => setSelectedDevice(null)} t={t} />
          ) : (
            <div className="fade-in-animation pb-5">
              <h3 className="mb-4 fw-bold">{t.myDevices || 'My Devices'}</h3>
              
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
                          <i className={`bi bi-camera-video ${dev.is_online ? 'text-success' : 'text-secondary'} fs-3`}></i>
                        </div>
                        <div className="flex-grow-1">
                           <h6 className="fw-bold mb-1">{dev.device_name}</h6>
                           <small className="text-muted d-block">
                             <span className={`badge ${dev.is_online ? 'bg-success' : 'bg-secondary'} me-2`}>
                               {dev.is_online ? 'Online' : 'Offline'}
                             </span>
                             Battery: {dev.battery_level}%
                           </small>
                        </div>
                     </div>
                  </div>
                ))
              )}
              
              <button onClick={() => handleMenuClick('add_device')} className="btn btn-primary shadow-lg d-flex justify-content-center align-items-center" style={{ position: 'fixed', bottom: '30px', right: '30px', width: '60px', height: '60px', borderRadius: '50%', fontSize: '26px', zIndex: 900 }}>
                 <i className="bi bi-plus-lg"></i>
              </button>
            </div>
          )
        )}

        {activeTab === 'settings' && <Settings user={user} t={t} lang={lang} setLang={setLang} textSize={textSize} setTextSize={setTextSize} />}
        {activeTab === 'add_device' && <AddDevice user={user} t={t} goBack={() => handleMenuClick('devices')} />}

      </div>
    </div>
  )
}

export default Dashboard;