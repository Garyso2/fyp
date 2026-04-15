import { useState, useEffect } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';

const VG_SERVICE_UUID = 'a07498ca-ad5b-474e-940d-16f1fbe7e8cd';
const VG_CHAR_UUID = '51ff12cb-fdf0-4222-800f-b91f37d3d224';

export const useWifiSetup = (t, deviceId, goBack) => {
  // --- State Management ---
  const [wifiStep, setWifiStep] = useState('check_connection');  // check_connection -> scanning -> select_wifi -> connecting -> success/failed
  const [availableWifi, setAvailableWifi] = useState([]);
  const [selectedSSID, setSelectedSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [incompleteData, setIncompleteData] = useState('');
  const [listeners, setListeners] = useState([]); // Track BLE listeners for cleanup

  // --- Detect if device is already connected via BLE ---
  useEffect(() => {
    console.log('🚀 [WiFi Setup] Initializing for device:', deviceId);
    checkBleConnection();
    
    // Cleanup listeners when component unmounts
    return () => {
      console.log('🧹 [WiFi Setup] Cleaning up BLE listeners');
      cleanupListeners();
    };
  }, [deviceId]);

  const cleanupListeners = async () => {
    try {
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      if (connected && connected.length > 0) {
        for (const listener of listeners) {
          try {
            await BleClient.stopNotifications(listener.deviceId, VG_SERVICE_UUID, VG_CHAR_UUID);
          } catch (e) {
            console.log('Listener cleanup error (non-critical):', e);
          }
        }
      }
    } catch (e) {
      console.log('Cleanup error (non-critical):', e);
    }
    setListeners([]);
  };

  const checkBleConnection = async () => {
    try {
      setIsLoading(true);
      console.log('🔍 [WiFi Setup] Checking BLE connection...');
      
      // Try to get connected devices
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (connected && connected.length > 0) {
        // Already connected, move to WiFi scanning
        console.log('✅ [WiFi Setup] Device connected via BLE');
        setIsConnected(true);
        setWifiStep('scanning');
        startWifiScan();
      } else {
        // Not connected, show error
        console.error('❌ [WiFi Setup] Device not connected via BLE');
        setErrorMessage('Device not connected via BLE. Please pair the device first.');
        setWifiStep('not_connected');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ [WiFi Setup] BLE connection check failed:', error);
      setErrorMessage('Failed to check BLE connection. Please try again.');
      setWifiStep('not_connected');
      setIsLoading(false);
    }
  };

  const startWifiScan = async () => {
    try {
      setIsLoading(true);
      setAvailableWifi([]);
      setErrorMessage('');
      console.log('📡 [WiFi Setup] Starting WiFi scan...');
      
      // Get connected devices
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (!connected || connected.length === 0) {
        throw new Error('Device disconnected');
      }

      const deviceId = connected[0].deviceId;
      
      // Start listening for WiFi list notifications
      console.log('🔔 [WiFi Setup] Starting to listen for WiFi networks...');
      
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          try {
            if (!value || !value.buffer) return;
            
            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 [WiFi Setup] WiFi scan response:', text);
            
            // Handle multi-part messages
            setIncompleteData(prev => {
              const combined = prev + text;
              
              try {
                const data = JSON.parse(combined);
                
                if (data.ssids && Array.isArray(data.ssids)) {
                  console.log('📡 [WiFi Setup] Found WiFi networks:', data.ssids);
                  setAvailableWifi(data.ssids);
                  return '';  // Reset incomplete data
                }
              } catch (parseError) {
                // Might be incomplete JSON, store for next chunk
                console.log('⏳ [WiFi Setup] Incomplete JSON, waiting for more data...');
              }
              return combined;
            });
          } catch (error) {
            console.error('❌ [WiFi Setup] Error processing WiFi response:', error);
          }
        }
      );

      // Send scan command to Pi
      const scanCommand = 'SCAN_WIFI';
      const data = new TextEncoder().encode(scanCommand);
      
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);
      console.log('📡 [WiFi Setup] WiFi scan command sent');
      
      setWifiStep('scanning');
      setIsLoading(false);
      
    } catch (error) {
      console.error('❌ [WiFi Setup] WiFi scan failed:', error);
      setErrorMessage('Failed to scan WiFi networks. Please ensure device is connected via BLE.');
      setWifiStep('not_connected');
      setIsLoading(false);
    }
  };

  const connectToWifi = async () => {
    try {
      if (!selectedSSID || !wifiPassword) {
        setErrorMessage('Please select a network and enter password');
        return;
      }

      setIsLoading(true);
      setErrorMessage('');
      setWifiStep('connecting');
      console.log('🔌 [WiFi Setup] Attempting to connect to:', selectedSSID);

      // Get connected device
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (!connected || connected.length === 0) {
        throw new Error('Device disconnected');
      }

      const deviceId = connected[0].deviceId;
      
      // Listen for connection result
      let resultReceived = false;
      let timeoutHandle = null;
      
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          try {
            if (!value || !value.buffer) return;
            
            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 [WiFi Setup] Connection response:', text);
            
            // ⚠️ CRITICAL: Check for WIFI_SUCCESS before other checks to avoid false negatives
            if (text.trim() === 'WIFI_SUCCESS' || text.includes('WIFI_SUCCESS')) {
              console.log('✅ [WiFi Setup] WiFi connection successful!');
              setWifiStep('success');
              resultReceived = true;
              setIsLoading(false);
              if (timeoutHandle) clearTimeout(timeoutHandle);
              
            } else if (text.includes('WIFI_TIMEOUT')) {
              console.log('⏱️ [WiFi Setup] WiFi connection timeout');
              setErrorMessage('Connection timeout. Please check your network.');
              setWifiStep('failed');
              resultReceived = true;
              setIsLoading(false);
              if (timeoutHandle) clearTimeout(timeoutHandle);
              
            } else if (text.includes('WIFI_FAIL')) {
              console.log('❌ [WiFi Setup] WiFi connection failed');
              setErrorMessage('Connection failed. Please check SSID and password.');
              setWifiStep('failed');
              resultReceived = true;
              setIsLoading(false);
              if (timeoutHandle) clearTimeout(timeoutHandle);
            }
          } catch (error) {
            console.error('❌ [WiFi Setup] Error processing connection response:', error);
          }
        }
      );

      // Send WiFi credentials
      const wifiConfig = JSON.stringify({
        ssid: selectedSSID,
        password: wifiPassword
      });
      
      const data = new TextEncoder().encode(wifiConfig);
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);
      console.log('📡 [WiFi Setup] WiFi credentials sent to device');
      
      // Set timeout for response (increased to 45 seconds to wait for retries)
      timeoutHandle = setTimeout(() => {
        if (!resultReceived) {
          console.log('⏱️ [WiFi Setup] No response from device (timeout)');
          setErrorMessage('No response from device. Please check if device is still connected.');
          setWifiStep('failed');
          setIsLoading(false);
        }
      }, 45000);  // 45 second timeout (to account for 3x retry from Pi)
      
      
    } catch (error) {
      console.error('❌ [WiFi Setup] Connection error:', error);
      setErrorMessage(error.message || 'Connection failed');
      setWifiStep('failed');
      setIsLoading(false);
    }
  };

  const resetSetup = () => {
    console.log('🔄 [WiFi Setup] Resetting WiFi setup');
    setWifiStep('scanning');
    setSelectedSSID('');
    setWifiPassword('');
    setErrorMessage('');
    setAvailableWifi([]);
  };

  const handleGoBack = async () => {
    console.log('🔙 [WiFi Setup] Going back...');
    try {
      await cleanupListeners();
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      if (connected && connected.length > 0) {
        try {
          await BleClient.disconnect(connected[0].deviceId);
          console.log('✅ [WiFi Setup] BLE disconnected');
        } catch (e) {
          console.log('Keep BLE connection for future use');
        }
      }
    } catch (error) {
      console.error('Disconnect error (non-critical):', error);
    }
    goBack();
  };

  return {
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
  };
};
