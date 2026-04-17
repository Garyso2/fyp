// ================== 📶 WiFi Setup Page ==================

import React from 'react';
import { i18n } from '../i18n';
import { useWifiSetup } from '../hooks/useWifiSetup';

export const WifiSetupPage = ({ device, user, lang, goBack }) => {
  const t = i18n[lang] || i18n.en;
  
  // ⚠️ Safety check: if device is missing, show error
  if (!device || !device.device_id) {
    return (
      <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <button onClick={goBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
          <i className="bi bi-arrow-left me-1"></i> {t.back}
        </button>
        <div className="card shadow-sm border-0">
          <div className="card-body text-center py-5">
            <i className="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
            <h5 className="fw-bold text-danger mb-3">Device Information Missing</h5>
            <p className="text-muted mb-4">Unable to start WiFi setup. Device ID not found.</p>
            <button onClick={goBack} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
              Go Back to Device
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    wifiStep,
    availableWifi,
    selectedSSID,
    setSelectedSSID,
    wifiPassword,
    setWifiPassword,
    isLoading,
    errorMessage,
    connectToWifi,
    resetSetup,
    handleGoBack,
    startWifiScan
  } = useWifiSetup(t, device.device_id, goBack);

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button onClick={handleGoBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      <div className="card shadow-sm border-0">
        <div className="card-body text-center py-5">
          
          {/* Not Connected State */}
          {wifiStep === 'not_connected' && (
            <div>
              <i className="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
              <h5 className="fw-bold text-danger mb-3">Device Not Connected</h5>
              <p className="text-muted mb-4">{errorMessage}</p>
              <button onClick={() => handleGoBack()} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
                Go Back to Device
              </button>
            </div>
          )}

          {/* Checking Connection State */}
          {wifiStep === 'check_connection' && (
            <div>
              <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">Checking BLE Connection...</h5>
              <p className="text-muted">Please ensure device is paired</p>
            </div>
          )}

          {/* WiFi Scanning State */}
          {wifiStep === 'scanning' && (
            <div>
              <i className="bi bi-wifi fs-1 text-primary mb-3"></i>
              <h5 className="fw-bold mb-3">Available Networks</h5>
              
              {errorMessage && (
                <div className="alert alert-danger mb-3">
                  <i className="bi bi-exclamation-circle me-2"></i>
                  {errorMessage}
                </div>
              )}

              {isLoading && availableWifi.length === 0 && (
                <div className="mb-4">
                  <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                  <span className="text-muted">Scanning networks...</span>
                </div>
              )}

              {availableWifi.length > 0 ? (
                <div className="text-start">
                  <div className="list-group mb-4">
                    {availableWifi.map((ssid, idx) => (
                      <label key={idx} className="list-group-item py-3 d-flex align-items-center cursor-pointer">
                        <input
                          type="radio"
                          name="ssid"
                          value={ssid}
                          checked={selectedSSID === ssid}
                          onChange={(e) => setSelectedSSID(e.target.value)}
                          className="form-check-input me-3"
                        />
                        <span className="flex-grow-1">
                          <i className="bi bi-wifi me-2 text-primary"></i>
                          <strong>{ssid}</strong>
                        </span>
                      </label>
                    ))}
                  </div>

                  {selectedSSID && (
                    <div>
                      <input
                        type="password"
                        className="form-control form-control-lg mb-3"
                        placeholder="WiFi Password"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                      />
                      <button
                        onClick={connectToWifi}
                        disabled={!wifiPassword || isLoading}
                        className="btn btn-success btn-lg w-100 fw-bold rounded-pill mb-2"
                      >
                        {isLoading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Connecting...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-check-circle me-2"></i>
                            Connect to {selectedSSID}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={startWifiScan}
                    disabled={isLoading}
                    className="btn btn-outline-primary btn-lg w-100"
                  >
                    <i className="bi bi-arrow-clockwise me-2"></i>
                    Rescan Networks
                  </button>
                </div>
              ) : (
                !isLoading && (
                  <div>
                    <p className="text-muted mb-3">No networks found</p>
                    <button
                      onClick={startWifiScan}
                      className="btn btn-primary btn-lg rounded-pill fw-bold w-100"
                    >
                      <i className="bi bi-arrow-clockwise me-2"></i>
                      Scan Again
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Connecting State */}
          {wifiStep === 'connecting' && (
            <div>
              <div className="spinner-border text-warning mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">Connecting to WiFi...</h5>
              <p className="text-muted">Connecting to: <strong>{selectedSSID}</strong></p>
              <p className="text-muted small">(This may take up to 30 seconds)</p>
            </div>
          )}

          {/* Success State */}
          {wifiStep === 'success' && (
            <div>
              <i className="bi bi-check-circle fs-1 text-success mb-3"></i>
              <h5 className="fw-bold text-success mb-3">WiFi Connected!</h5>
              <p className="text-muted mb-3">Successfully connected to <strong>{selectedSSID}</strong></p>
              <p className="text-muted small mb-4">Your device is now online and can communicate with the server.</p>
              <button
                onClick={handleGoBack}
                className="btn btn-success btn-lg rounded-pill fw-bold w-100"
              >
                <i className="bi bi-arrow-left me-2"></i> Back to Device
              </button>
            </div>
          )}

          {/* Failed State */}
          {wifiStep === 'failed' && (
            <div>
              <i className="bi bi-exclamation-circle fs-1 text-danger mb-3"></i>
              <h5 className="fw-bold text-danger mb-3">Connection Failed</h5>
              <p className="text-muted mb-4">{errorMessage || 'Failed to connect to WiFi'}</p>
              <div className="d-grid gap-2">
                <button
                  onClick={resetSetup}
                  className="btn btn-primary btn-lg rounded-pill fw-bold"
                >
                  <i className="bi bi-arrow-clockwise me-2"></i> Try Again
                </button>
                <button
                  onClick={handleGoBack}
                  className="btn btn-outline-secondary btn-lg rounded-pill"
                >
                  <i className="bi bi-arrow-left me-2"></i> Back to Device
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
