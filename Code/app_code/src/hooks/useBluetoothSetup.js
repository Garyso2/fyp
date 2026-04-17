import { useState, useEffect } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BLE_SERVICE_UUID, BLE_CHAR_UUID } from '../constants';

const BT_SCAN_TIMEOUT = 15000; // 15 seconds
const BT_OPERATION_TIMEOUT = 30000; // 30 seconds

export const useBluetoothSetup = (t, deviceId, goBack) => {
  // --- State Management ---
  const [btStep, setBtStep] = useState('check_connection'); // check_connection -> paired_view -> scanning -> select_device -> connecting -> success/failed
  const [availableDevices, setAvailableDevices] = useState([]);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [selectedMAC, setSelectedMAC] = useState('');
  const [selectedDeviceName, setSelectedDeviceName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [incompleteData, setIncompleteData] = useState('');
  const [connectedDevices, setConnectedDevices] = useState([]);

  // --- Check BLE connection on component mount ---
  useEffect(() => {
    checkBleConnection();
  }, [deviceId]);

  const checkBleConnection = async () => {
    try {
      setIsLoading(true);

      // Try to get connected devices
      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);

      if (connected && connected.length > 0) {
        // Already connected, get paired Bluetooth devices from Pi
        setIsConnected(true);
        await getPairedDevices();
      } else {
        // Not connected, show error
        setErrorMessage('Device not connected via BLE. Please pair the device first.');
        setBtStep('not_connected');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ BLE connection check failed:', error);
      setErrorMessage('Failed to check BLE connection. Please try again.');
      setBtStep('not_connected');
      setIsLoading(false);
    }
  };

  const getPairedDevices = async () => {
    try {
      setBtStep('paired_view');
      setIsLoading(true);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setBtStep('not_connected');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send GET_PAIRED_BT command
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from('GET_PAIRED_BT').buffer
      );

      // Listen for paired devices response
      await BleClient.startNotifications(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        (data) => {
          try {
            const buffer = Buffer.from(data.value);
            const response = buffer.toString('utf-8');

            let jsonData = incompleteData + response;
            try {
              const parsed = JSON.parse(jsonData);
              setIncompleteData('');

              if (parsed.type === 'paired_devices') {
                setPairedDevices(parsed.devices || []);
                setConnectedDevices(parsed.connected || []);
                console.log('✅ Paired devices received:', parsed.devices);
              }
            } catch (e) {
              // Incomplete JSON, keep accumulating
              setIncompleteData(jsonData);
            }
          } catch (error) {
            console.error('❌ Failed to parse paired devices:', error);
          }
        }
      );

      setIsLoading(false);
    } catch (error) {
      console.error('❌ Failed to get paired devices:', error);
      setErrorMessage('Failed to retrieve paired devices.');
      setBtStep('not_connected');
      setIsLoading(false);
    }
  };

  const startBluetoothScan = async () => {
    try {
      setBtStep('scanning');
      setIsLoading(true);
      setAvailableDevices([]);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setBtStep('not_connected');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send SCAN_BT command
      console.log('📡 Sending SCAN_BT command to Pi...');
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from('SCAN_BT').buffer
      );

      // Set timeout for scan
      const scanTimeout = setTimeout(() => {
        console.log('⏱️  Bluetooth scan timeout reached');
        if (availableDevices.length === 0) {
          setErrorMessage('No devices found during scan.');
          setBtStep('paired_view');
        }
        setIsLoading(false);
      }, BT_SCAN_TIMEOUT);

      // Listen for available devices response
      await BleClient.startNotifications(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        (data) => {
          try {
            const buffer = Buffer.from(data.value);
            const response = buffer.toString('utf-8');

            let jsonData = incompleteData + response;
            try {
              const parsed = JSON.parse(jsonData);
              setIncompleteData('');

              if (parsed.type === 'available_devices') {
                setAvailableDevices((prev) => {
                  // Avoid duplicates
                  const existing = new Set(prev.map((d) => d.mac));
                  const newDevices = parsed.devices.filter((d) => !existing.has(d.mac));
                  return [...prev, ...newDevices];
                });
                console.log('✅ Devices found:', parsed.devices);
              }
            } catch (e) {
              // Incomplete JSON, keep accumulating
              setIncompleteData(jsonData);
            }
          } catch (error) {
            console.error('❌ Failed to parse devices:', error);
          }
        }
      );

      // Transition to device selection after scan completes
      setTimeout(() => {
        clearTimeout(scanTimeout);
        if (availableDevices.length > 0) {
          setBtStep('select_device');
        } else {
          setBtStep('paired_view');
        }
        setIsLoading(false);
      }, BT_SCAN_TIMEOUT);
    } catch (error) {
      console.error('❌ Bluetooth scan failed:', error);
      setErrorMessage('Failed to scan Bluetooth devices.');
      setBtStep('paired_view');
      setIsLoading(false);
    }
  };

  const pairDevice = async (mac, name) => {
    try {
      setBtStep('connecting');
      setIsLoading(true);
      setSelectedMAC(mac);
      setSelectedDeviceName(name);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setBtStep('paired_view');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send PAIR_BT command
      console.log(`📡 Sending PAIR_BT command for ${mac}...`);
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from(`PAIR_BT:${mac}`).buffer
      );

      // Set timeout for pairing
      const pairingTimeout = setTimeout(() => {
        console.log('⏱️  Pairing timeout reached');
        setErrorMessage('Pairing timeout. Please try again.');
        setBtStep('select_device');
        setIsLoading(false);
      }, BT_OPERATION_TIMEOUT);

      // Listen for response
      let responseReceived = false;
      await BleClient.startNotifications(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        (data) => {
          if (responseReceived) return;

          try {
            const buffer = Buffer.from(data.value);
            const response = buffer.toString('utf-8').trim();

            if (response === 'BT_SUCCESS') {
              responseReceived = true;
              clearTimeout(pairingTimeout);
              console.log('✅ Device paired successfully');
              setBtStep('success');
              setIsLoading(false);
            } else if (response === 'BT_FAIL') {
              responseReceived = true;
              clearTimeout(pairingTimeout);
              console.log('❌ Pairing failed');
              setErrorMessage('Pairing failed. Please try again.');
              setBtStep('select_device');
              setIsLoading(false);
            }
          } catch (error) {
            console.error('❌ Failed to parse pairing response:', error);
          }
        }
      );
    } catch (error) {
      console.error('❌ Pairing error:', error);
      setErrorMessage('Failed to pair device.');
      setBtStep('select_device');
      setIsLoading(false);
    }
  };

  const connectDevice = async (mac, name) => {
    try {
      setBtStep('connecting');
      setIsLoading(true);
      setSelectedMAC(mac);
      setSelectedDeviceName(name);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setBtStep('paired_view');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send CONNECT_BT command
      console.log(`📡 Sending CONNECT_BT command for ${mac}...`);
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from(`CONNECT_BT:${mac}`).buffer
      );

      // Set timeout for connection
      const connectTimeout = setTimeout(() => {
        console.log('⏱️  Connection timeout reached');
        setErrorMessage('Connection timeout. Please try again.');
        setBtStep('paired_view');
        setIsLoading(false);
      }, BT_OPERATION_TIMEOUT);

      // Listen for response
      let responseReceived = false;
      await BleClient.startNotifications(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        (data) => {
          if (responseReceived) return;

          try {
            const buffer = Buffer.from(data.value);
            const response = buffer.toString('utf-8').trim();

            if (response === 'BT_SUCCESS') {
              responseReceived = true;
              clearTimeout(connectTimeout);
              console.log('✅ Device connected successfully');
              setBtStep('success');
              setIsLoading(false);
            } else if (response === 'BT_FAIL') {
              responseReceived = true;
              clearTimeout(connectTimeout);
              console.log('❌ Connection failed');
              setErrorMessage('Connection failed. Please try again.');
              setBtStep('paired_view');
              setIsLoading(false);
            }
          } catch (error) {
            console.error('❌ Failed to parse connection response:', error);
          }
        }
      );
    } catch (error) {
      console.error('❌ Connection error:', error);
      setErrorMessage('Failed to connect device.');
      setBtStep('paired_view');
      setIsLoading(false);
    }
  };

  const disconnectDevice = async (mac) => {
    try {
      setIsLoading(true);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send DISCONNECT_BT command
      console.log(`📡 Sending DISCONNECT_BT command for ${mac}...`);
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from(`DISCONNECT_BT:${mac}`).buffer
      );

      // Small delay then refresh list
      setTimeout(() => {
        getPairedDevices();
      }, 2000);
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      setErrorMessage('Failed to disconnect device.');
    }
  };

  const removeDevice = async (mac) => {
    try {
      setIsLoading(true);

      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (!connected || connected.length === 0) {
        setErrorMessage('BLE connection lost. Please reconnect.');
        setIsLoading(false);
        return;
      }

      const deviceId = connected[0].deviceId;

      // Send REMOVE_BT command
      console.log(`📡 Sending REMOVE_BT command for ${mac}...`);
      await BleClient.write(
        deviceId,
        BLE_SERVICE_UUID,
        BLE_CHAR_UUID,
        Buffer.from(`REMOVE_BT:${mac}`).buffer
      );

      // Small delay then refresh list
      setTimeout(() => {
        getPairedDevices();
      }, 2000);
    } catch (error) {
      console.error('❌ Remove error:', error);
      setErrorMessage('Failed to remove device.');
    }
  };

  const resetSetup = () => {
    setAvailableDevices([]);
    setSelectedMAC('');
    setSelectedDeviceName('');
    setErrorMessage('');
    setBtStep('paired_view');
  };

  const handleGoBack = async () => {
    try {
      // Cancel ongoing scans
      const connected = await BleClient.getConnectedDevices([BLE_SERVICE_UUID]);
      if (connected && connected.length > 0) {
        const deviceId = connected[0].deviceId;
        await BleClient.write(
          deviceId,
          BLE_SERVICE_UUID,
          BLE_CHAR_UUID,
          Buffer.from('CANCEL_BT_SETUP').buffer
        );
      }
    } catch (error) {
      console.error('⚠️  Error cancelling setup:', error);
    }

    goBack();
  };

  return {
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
  };
};
