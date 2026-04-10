import { useState, useEffect } from 'react'
import 'bootstrap-icons/font/bootstrap-icons.css'

// 🎯 新增咗 user 作為 Props，用嚟做「解除綁定」
const DeviceLogs = ({ user, device, onBack, t }) => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  // 讀取日誌
  const fetchLogs = async () => {
    if (!device || !device.device_id) return;
    setLoading(true);
    try {
      const response = await fetch(`http://100.125.29.38:8000/api/devices/${device.device_id}/logs`, {
        headers: { 'x-api-key': 'yoloProject2026' }
      });
      const data = await response.json();
      if (response.ok) {
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error("❌ 連接伺服器失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [device.device_id]);

  // ================= 🛠️ 新增：裝置管理功能 =================

  // 1. 移除裝置 (解除 User 與 Device 嘅綁定)
  const handleRemoveDevice = async () => {
    const confirmMsg = t.confirmRemove || '⚠️ 警告：確定要移除此裝置嗎？這將解除您的帳號與此設備的綁定。';
    if (!window.confirm(confirmMsg)) return;

    try {
      // 🚀 呼叫 Server API 刪除 `user_device` 裡面嘅紀錄
      const response = await fetch(`http://100.125.29.38:8000/api/users/${user?.user_id}/devices/${device.device_id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': 'yoloProject2026' }
      });

      if (response.ok) {
        console.log("✅ 成功解除綁定");
        // 成功後直接返回主頁，Dashboard 嘅 useEffect 會自動幫你刷新最新設備名單！
        onBack(); 
      } else {
        alert(t.removeFailed || '移除失敗，請確保網絡連線正常。');
      }
    } catch (error) {
      console.error("❌ 移除裝置錯誤:", error);
    }
  };

  // 2. 設定新 Wi-Fi (需要藍牙)
  const handleSetupWifi = () => {
    // 💡 呢度未來可以彈出一個 Modal，或者載入你之前寫嘅 useBleSetup()
    alert(t.ensureBleConnected || '即將開啟藍牙設定... 請確保手機已開啟藍牙並靠近 Pi。');
    // 放入你嘅 BLE Wi-Fi 設定邏輯
  };

  // 3. 連接新藍牙設備 (例如藍牙耳機俾視障人士聽聲)
  const handleAddBluetoothAccessory = () => {
    alert(t.scanBleAccessory || '即將掃描附近的藍牙耳機/設備...');
    // 放入你嘅 Pi 尋找藍牙設備邏輯
  };

  return (
    <div className="fade-in-animation h-100 d-flex flex-column">
      
      <div className="mb-4">
        {/* 🌍 返回按鈕 */}
        <button onClick={onBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
          <i className="bi bi-arrow-left me-1"></i> {t.backToDevices || '返回設備列表'}
        </button>

        <div className="card shadow-sm border-0">
          <div className="card-body">
            
            {/* 頂部：裝置名稱與狀態 */}
            <div className="d-flex align-items-center justify-content-between flex-wrap mb-3">
              <div>
                <h3 className="m-0 text-primary fw-bold">{device.device_name}</h3>
                <div className="text-muted mt-1">
                  <i className="bi bi-cpu me-1"></i> ID: <strong>{device.device_id}</strong>
                </div>
              </div>

              <div className="d-flex align-items-center mt-3 mt-md-0">
                <div className="text-end me-4">
                  <div className="fw-bold text-muted" style={{fontSize: '0.8rem'}}>{t.status || '狀態'}</div>
                  {device.is_online 
                    ? <span className="badge bg-success rounded-pill">{t.online || '在線'}</span>
                    : <span className="badge bg-danger rounded-pill">{t.offline || '離線'}</span>
                  }
                </div>
                <div className="text-end" style={{minWidth: '80px'}}>
                  <div className="fw-bold text-muted" style={{fontSize: '0.8rem'}}>{t.battery || '電量'}</div>
                  <div className="progress mt-1" style={{height: '8px'}}>
                    <div className={`progress-bar ${(device.battery_level || 0) > 20 ? 'bg-success' : 'bg-danger'}`} style={{width: `${device.battery_level || 0}%`}}></div>
                  </div>
                  <small className="fw-bold">{device.battery_level || 0}%</small>
                </div>
              </div>
            </div>

            {/* 👇 新增：裝置管理操作列 (Action Bar) */}
            <div className="d-flex flex-wrap gap-2 pt-3 border-top">
              <button onClick={handleSetupWifi} className="btn btn-sm btn-outline-secondary flex-grow-1">
                <i className="bi bi-wifi me-1"></i> {t.updateWifi || '設定 Wi-Fi'}
              </button>
              <button onClick={handleAddBluetoothAccessory} className="btn btn-sm btn-outline-secondary flex-grow-1">
                <i className="bi bi-bluetooth me-1"></i> {t.addBleDevice || '配對藍牙'}
              </button>
              <button onClick={handleRemoveDevice} className="btn btn-sm btn-outline-danger flex-grow-1">
                <i className="bi bi-trash3 me-1"></i> {t.removeDevice || '移除裝置'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* 活動日誌列表 (保持不變) */}
      <div className="card shadow border-0 flex-grow-1 d-flex flex-column" style={{overflow: 'hidden'}}>
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold"><i className="bi bi-list-task me-2"></i>{t.activityLogs || '活動日誌'}</h5>
          <button onClick={fetchLogs} className="btn btn-sm btn-outline-primary" disabled={loading}>
            <i className={`bi bi-arrow-clockwise me-1 ${loading ? 'spin-animation' : ''}`}></i> {t.refresh || '刷新'}
          </button>
        </div>
        
        <div className="card-body p-0" style={{overflowY: 'auto'}}>
          <table className="table table-hover table-striped mb-0 align-middle">
            <thead className="table-light sticky-top">
              <tr>
                <th scope="col" className="ps-4">{t.time || '時間'}</th>
                <th scope="col">{t.type || '類型'}</th>
                <th scope="col">{t.content || '內容'}</th>
                <th scope="col">{t.snapshot || '快照'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="text-center py-5">
                  <div className="spinner-border text-primary me-2" role="status" size="sm"></div>
                  {t.loadingLogs || '載入中...'}
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="4" className="text-center py-5 text-muted">{t.noLogs || '暫時未有任何活動紀錄'}</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.activity_id || Math.random()}>
                    <td className="ps-4 text-muted">{log.created_at || log.time}</td>
                    <td>
                      <span className={`badge ${
                        log.activity_type === 'OCR' ? 'bg-info text-dark' :
                        log.activity_type === 'OBJECT' ? 'bg-primary' :
                        log.activity_type === 'COLOR' ? 'bg-warning text-dark' : 'bg-secondary'
                      }`}>{log.activity_type}</span>
                    </td>
                    <td className="fw-bold text-dark">{log.detected_content}</td>
                    <td>
                      {log.image_url ? (
                        <img src={log.image_url} alt="snapshot" className="rounded border" style={{width: '40px', height: '40px', objectFit: 'cover'}} />
                      ) : <span className="text-muted">-</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

export default DeviceLogs