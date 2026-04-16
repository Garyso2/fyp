import React from 'react';
import { useBleSetup } from './useBleSetup'; // 確保你同一個 Folder 有呢個 Hook

// 1. 加返個 Component 外殼，接收外層傳入嚟嘅 Props
const AddDevice = ({ user, goBack, t }) => {
  
  // 2. 呼叫 Hook，將裡面所有用得著嘅狀態同 Function 拆解出嚟
  const {
    bleStep,
    startScan,
    isScanning,
    foundDevices,
    connectToDevice,
    wifiData,
    setWifiData,
    availableWifi,
    sendWifiConfig,
    connectedDeviceId,
    disconnectDevice
  } = useBleSetup();

  // 3. 處理「完成」按鈕嘅動作：綁定 Database -> 斷開藍牙 -> 返回主頁
  const handleFinishAndBind = async () => {
    // 🔴 CRITICAL: Get device_id from localStorage (sent by Pi during WiFi success)
    const piDeviceId = localStorage.getItem('piDeviceId');
    
    if (!piDeviceId) {
      alert('❌ Device ID not received from Pi. Please restart WiFi setup.');
      return;
    }
    
    console.log('📱 [Bind Device] Using Pi device_id from localStorage:', piDeviceId);

    try {
      console.log("正在將 Pi 綁定至帳號...");
      const response = await fetch('http://100.125.29.38:8000/api/bind_device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'yoloProject2026' },
        body: JSON.stringify({
          user_id: user?.user_id,
          device_id: piDeviceId,  // 🔴 Use Pi's device_id, not BLE device_id
          device_name: 'My VisualGuard Pi'
        })
      });
      
      if (response.ok) {
        console.log("✅ 成功將 Device 綁定到 User Database!");
      } else {
        console.warn("⚠️ 伺服器拒絕咗綁定請求");
      }
    } catch (error) {
      console.error("❌ 連接伺服器綁定失敗:", error);
    } finally {
      // 4. 無論 API 成唔成功，都執行清場動作
      if (disconnectDevice) disconnectDevice(); // 斷開手機同 Pi 嘅藍牙
      goBack(); // 返回 Dashboard 主頁
    }
  };

  // 5. 渲染畫面
  return (
    <div className="fade-in-animation">
      <div className="card shadow-sm border-0 rounded-4">
        <div className="card-header bg-white py-3">
          {/* 返回按鈕 */}
          <button onClick={goBack} className="btn btn-link text-dark p-0 float-start">
            <i className="bi bi-arrow-left fs-5"></i>
          </button>
          <h5 className="mb-0 text-primary fw-bold text-center"><i className="bi bi-bluetooth me-2"></i>{t.linkPi || '配對新裝置'}</h5>
        </div>
        <div className="card-body p-4 text-center">
          
          {bleStep === 'start' && (
            <div>
              <i className="bi bi-broadcast fs-1 text-primary mb-3"></i>
              <p className="text-muted">{t.turnOnPi || '請確保裝置已開啟'}</p>
              <button onClick={startScan} className="btn btn-primary btn-lg w-100 rounded-pill fw-bold">
                {t.scanPi || '掃描裝置'}
              </button>
            </div>
          )}
          
          {bleStep === 'scanning' && (
            <div>
              {isScanning && <div className="spinner-border text-primary mb-3"></div>}
              <h5>{t.searching || '搜尋中...'}</h5>
              <div className="list-group text-start mt-4 shadow-sm">
                  {foundDevices.map(dev => (
                    <button key={dev.deviceId} onClick={() => connectToDevice(dev)} className="list-group-item list-group-item-action py-3 d-flex justify-content-between align-items-center">
                      <span className="fw-bold">{dev.name || "VisualGuard Pi"}</span>
                      <span className="badge bg-primary rounded-pill">{t.connect || '連線'}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
          
          {bleStep === 'fetching_wifi' && (
            <div className="py-5">
              <div className="spinner-border text-warning mb-3" style={{width: '3rem', height: '3rem'}}></div>
              <h5 className="fw-bold">{t.fetchingWifi || '讀取中...'}</h5>
              <p className="text-muted">{t.fetchingWait || '請稍候'}</p>
            </div>
          )}
          
          {bleStep === 'select_wifi' && (
            <div className="text-start">
              <h5 className="fw-bold text-center mb-4">{t.chooseNetwork || '選擇網絡'}</h5>
              <div className="mb-3">
                <label className="form-label fw-bold">{t.selectWifi || 'Wi-Fi 名稱'}</label>
                <select className="form-select form-select-lg" value={wifiData.ssid} onChange={e => setWifiData({...wifiData, ssid: e.target.value})}>
                  {availableWifi.map((net, idx) => <option key={idx} value={net}>{net}</option>)}
                </select>
              </div>
              <div className="mb-4">
                <label className="form-label fw-bold">{t.password || '密碼'}</label>
                <input type="password" className="form-control form-control-lg" placeholder="..." value={wifiData.password} onChange={e => setWifiData({...wifiData, password: e.target.value})} />
              </div>
              <button onClick={sendWifiConfig} className="btn btn-primary btn-lg w-100 rounded-pill fw-bold mb-3">
                {t.connectWifi || '連接 Wi-Fi'}
              </button>
            </div>
          )}
          
          {bleStep === 'connecting_wifi' && (
            <div className="py-5">
              <div className="spinner-grow text-primary mb-3" style={{width: '3rem', height: '3rem'}}></div>
              <h5 className="fw-bold">{t.connecting || '連接中...'}</h5>
              <p className="text-muted">{t.connectingTo} {wifiData.ssid}</p>
            </div>
          )}
          
          {bleStep === 'success' && (
            <div className="py-4">
              <i className="bi bi-check-circle-fill text-success mb-3" style={{fontSize: '5rem'}}></i>
              <h4 className="fw-bold">{t.setupComplete || '設定完成!'}</h4>
              <p className="text-muted">{t.deviceConnected || '裝置已準備就緒'}</p>
              <div className="alert alert-light border border-success mt-4 mb-4 text-start">
                <strong>Device ID:</strong> <span className="text-primary">{localStorage.getItem('piDeviceId') || "PI_VG_8899"}</span><br/>
                <strong>Network:</strong> {wifiData.ssid}
              </div>
              {/* 👇 呢度將 onClick 換咗做 handleFinishAndBind */}
              <button onClick={handleFinishAndBind} className="btn btn-success btn-lg w-100 rounded-pill fw-bold">
                {t.doneReturn || '完成並返回'}
              </button>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

export default AddDevice;