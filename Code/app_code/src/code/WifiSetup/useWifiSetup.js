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

  // --- Detect if device is already connected via BLE ---
  useEffect(() => {
    checkBleConnection();
  }, [deviceId]);

  const checkBleConnection = async () => {
    try {
      setIsLoading(true);
      
      // Try to get connected devices
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (connected && connected.length > 0) {
        // Already connected, move to WiFi scanning
        setIsConnected(true);
        setWifiStep('scanning');
        startWifiScan();
      } else {
        // Not connected, show error
        setErrorMessage('Device not connected via BLE. Please pair the device first.');
        setWifiStep('not_connected');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ BLE connection check failed:', error);
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
      
      // Get connected devices
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (!connected || connected.length === 0) {
        throw new Error('Device disconnected');
      }

      const deviceId = connected[0].deviceId;
      
      // Start listening for WiFi list notifications
      console.log('🔔 Starting to listen for WiFi networks...');
      
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          try {
            if (!value || !value.buffer) return;
            
            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 WiFi scan response:', text);
            
            // Handle multi-part messages
            const combined = incompleteData + text;
            setIncompleteData('');

            try {
              const data = JSON.parse(combined);
              
              if (data.ssids && Array.isArray(data.ssids)) {
                console.log('📡 Found WiFi networks:', data.ssids);
                setAvailableWifi(data.ssids);
              }
            } catch (parseError) {
              // Might be incomplete JSON, store for next chunk
              setIncompleteData(combined);
            }
          } catch (error) {
            console.error('❌ Error processing WiFi response:', error);
          }
        }
      );

      // Send scan command to Pi
      const scanCommand = 'SCAN_WIFI';
      const data = new TextEncoder().encode(scanCommand);
      
      await BleClient.write(deviceId, VG_SERVICE_UUID, VG_CHAR_UUID, data);
      console.log('📡 WiFi scan command sent');
      
      setWifiStep('scanning');
      setIsLoading(false);
      
    } catch (error) {
      console.error('❌ WiFi scan failed:', error);
      setErrorMessage('Failed to scan WiFi networks');
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

      // Get connected device
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      
      if (!connected || connected.length === 0) {
        throw new Error('Device disconnected');
      }

      const deviceId = connected[0].deviceId;
      
      // Listen for connection result
      let resultReceived = false;
      
      await BleClient.startNotifications(
        deviceId,
        VG_SERVICE_UUID,
        VG_CHAR_UUID,
        (value) => {
          try {
            if (!value || !value.buffer) return;
            
            const text = new TextDecoder().decode(value.buffer);
            console.log('📨 Connection response:', text);
            
            if (text.includes('WIFI_SUCCESS')) {
              setWifiStep('success');
              resultReceived = true;
              setIsLoading(false);
            } else if (text.includes('WIFI_TIMEOUT')) {
              setErrorMessage('Connection timeout. Please check your network.');
              setWifiStep('failed');
              resultReceived = true;
              setIsLoading(false);
            } else if (text.includes('WIFI_FAIL')) {
              setErrorMessage('Connection failed. Please check SSID and password.');
              setWifiStep('failed');
              resultReceived = true;
              setIsLoading(false);
            }
          } catch (error) {
            console.error('❌ Error processing WiFi response:', error);
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
      console.log('📡 WiFi credentials sent to device');
      
      // Set timeout for response
      setTimeout(() => {
        if (!resultReceived) {
          setErrorMessage('No response from device');
          setWifiStep('failed');
          setIsLoading(false);
        }
      }, 30000);  // 30 second timeout
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      setErrorMessage(error.message || 'Connection failed');
      setWifiStep('failed');
      setIsLoading(false);
    }
  };

  const resetSetup = () => {
    setWifiStep('scanning');
    setSelectedSSID('');
    setWifiPassword('');
    setErrorMessage('');
    setAvailableWifi([]);
  };

  const handleGoBack = async () => {
    try {
      const connected = await BleClient.getConnectedDevices([VG_SERVICE_UUID]);
      if (connected && connected.length > 0) {
        await BleClient.disconnect(connected[0].deviceId);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
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
