// ================== 📱 Bluetooth Setup Page ==================

import React from 'react';
import { i18n } from '../i18n';
import { useBluetoothSetup } from '../code/BluetoothSetup/useBluetoothSetup';

export const BluetoothSetupPage = ({ device, user, lang, goBack }) => {
  const t = i18n[lang] || i18n.en;
  const {
    btStep,
    availableDevices,
    pairedDevices,
    connectedDevices,
    selectedMAC,
    selectedDeviceName,
    isLoading,
    errorMessage,
    startBluetoothScan,
    pairDevice,
    connectDevice,
    disconnectDevice,
    removeDevice,
    resetSetup,
    handleGoBack,
    getPairedDevices
  } = useBluetoothSetup(t, device?.device_id, goBack);

  return (
    <div className="pb-5 p-4" style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <button onClick={handleGoBack} className="btn btn-link text-decoration-none p-0 mb-3 fw-bold">
        <i className="bi bi-arrow-left me-1"></i> {t.back}
      </button>

      <div className="card shadow-sm border-0">
        <div className="card-body py-5">
          
          {/* Not Connected State */}
          {btStep === 'not_connected' && (
            <div className="text-center">
              <i className="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
              <h5 className="fw-bold text-danger mb-3">Device Not Connected</h5>
              <p className="text-muted mb-4">{errorMessage}</p>
              <button onClick={() => handleGoBack()} className="btn btn-primary btn-lg rounded-pill fw-bold w-100">
                Go Back to Device
              </button>
            </div>
          )}

          {/* Checking BLE Connection */}
          {btStep === 'check_connection' && (
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">Checking BLE Connection...</h5>
              <p className="text-muted">Please ensure device is paired</p>
            </div>
          )}

          {/* Paired Devices View */}
          {btStep === 'paired_view' && (
            <div>
              <h5 className="fw-bold mb-4">
                <i className="bi bi-bluetooth me-2 text-primary"></i>Bluetooth Devices
              </h5>

              {/* Action Buttons */}
              <div className="d-grid gap-2 mb-4">
                <button
                  onClick={startBluetoothScan}
                  disabled={isLoading}
                  className="btn btn-primary btn-lg rounded-pill fw-bold"
                >
                  {isLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Scanning...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-search me-2"></i>Scan for Devices
                    </>
                  )}
                </button>
              </div>

              {/* Connected Devices */}
              {connectedDevices.length > 0 && (
                <div className="mb-4">
                  <h6 className="fw-bold text-success mb-3">
                    <i className="bi bi-check-circle me-2"></i>Connected ({connectedDevices.length})
                  </h6>
                  {connectedDevices.map((device) => (
                    <div key={device.mac} className="card border-success mb-2">
                      <div className="card-body d-flex justify-content-between align-items-center py-2">
                        <div>
                          <strong className="text-success">{device.name}</strong>
                          <br />
                          <small className="text-muted">{device.mac}</small>
                        </div>
                        <button
                          onClick={() => disconnectDevice(device.mac)}
                          className="btn btn-sm btn-outline-danger"
                        >
                          <i className="bi bi-x-circle"></i> Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Paired but Not Connected Devices */}
              {pairedDevices.filter(d => !connectedDevices.some(c => c.mac === d.mac)).length > 0 && (
                <div className="mb-4">
                  <h6 className="fw-bold text-warning mb-3">
                    <i className="bi bi-dash-circle me-2"></i>Paired ({pairedDevices.filter(d => !connectedDevices.some(c => c.mac === d.mac)).length})
                  </h6>
                  {pairedDevices.filter(d => !connectedDevices.some(c => c.mac === d.mac)).map((device) => (
                    <div key={device.mac} className="card border-warning mb-2">
                      <div className="card-body d-flex justify-content-between align-items-center py-2">
                        <div>
                          <strong>{device.name}</strong>
                          <br />
                          <small className="text-muted">{device.mac}</small>
                        </div>
                        <div className="btn-group" role="group">
                          <button
                            onClick={() => connectDevice(device.mac, device.name)}
                            className="btn btn-sm btn-outline-success"
                          >
                            <i className="bi bi-link"></i> Connect
                          </button>
                          <button
                            onClick={() => removeDevice(device.mac)}
                            className="btn btn-sm btn-outline-danger"
                          >
                            <i className="bi bi-trash"></i> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No Paired Devices */}
              {pairedDevices.length === 0 && (
                <div className="text-center text-muted py-4">
                  <i className="bi bi-bluetooth" style={{ fontSize: '2rem' }}></i>
                  <p className="mt-2">No paired Bluetooth devices</p>
                  <p className="small">Click "Scan for Devices" to find and pair a device</p>
                </div>
              )}
            </div>
          )}

          {/* Scanning for Devices */}
          {btStep === 'scanning' && (
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">Scanning for Devices...</h5>
              <p className="text-muted">This may take a few seconds</p>
            </div>
          )}

          {/* Select Device from Scan Results */}
          {btStep === 'select_device' && (
            <div>
              <h5 className="fw-bold mb-4">
                <i className="bi bi-list-ul me-2"></i>Available Devices
              </h5>

              {availableDevices.length === 0 ? (
                <div className="text-center text-muted py-4">
                  <i className="bi bi-search" style={{ fontSize: '2rem' }}></i>
                  <p className="mt-2">No devices found</p>
                  <button
                    onClick={resetSetup}
                    className="btn btn-outline-primary btn-sm mt-2"
                  >
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Try Again
                  </button>
                </div>
              ) : (
                <div>
                  {availableDevices.map((device) => (
                    <div key={device.mac} className="card border-primary mb-2">
                      <div className="card-body d-flex justify-content-between align-items-center py-2">
                        <div>
                          <strong className="text-primary">{device.name}</strong>
                          <br />
                          <small className="text-muted">{device.mac}</small>
                        </div>
                        <button
                          onClick={() => pairDevice(device.mac, device.name)}
                          className="btn btn-sm btn-primary"
                        >
                          <i className="bi bi-link-45deg"></i> Pair
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={resetSetup}
                    className="btn btn-outline-secondary w-100 mt-3"
                  >
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Clear & Rescan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Connecting State */}
          {btStep === 'connecting' && (
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" style={{ width: '3rem', height: '3rem' }}></div>
              <h5 className="fw-bold">Connecting...</h5>
              <p className="text-muted">{selectedDeviceName}</p>
              <small className="text-muted d-block">{selectedMAC}</small>
            </div>
          )}

          {/* Success State */}
          {btStep === 'success' && (
            <div className="text-center">
              <div style={{ fontSize: '3rem' }} className="mb-3">
                <i className="bi bi-check-circle text-success"></i>
              </div>
              <h5 className="fw-bold text-success mb-1">Success!</h5>
              <p className="text-muted mb-4">{selectedDeviceName} connected</p>
              <button
                onClick={() => getPairedDevices()}
                className="btn btn-primary btn-lg rounded-pill fw-bold w-100"
              >
                Back to Devices List
              </button>
            </div>
          )}

          {/* Error Display */}
          {errorMessage && btStep !== 'not_connected' && btStep !== 'success' && (
            <div className="alert alert-danger mt-3" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
