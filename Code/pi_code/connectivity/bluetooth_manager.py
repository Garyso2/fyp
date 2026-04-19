# ================== 📱 Bluetooth Manager ==================

import re
import subprocess
import time
from typing import List
from constants import (
    BT_PAIR_TIMEOUT,
    BT_CONNECT_TIMEOUT,
    BT_DISCONNECT_TIMEOUT,
    BT_REMOVE_TIMEOUT,
    BT_SCAN_DURATION,
    MAX_SCAN_ITERATIONS
)

# Regex: valid Bluetooth MAC address (e.g. AA:BB:CC:DD:EE:FF)
_MAC_RE = re.compile(r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$')

def _validate_mac(mac: str) -> str:
    """Validate and return a sanitized MAC address, or raise ValueError."""
    mac = mac.strip()
    if not _MAC_RE.match(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    return mac


class BluetoothManager:
    """Manage Bluetooth device pairing and connection via bluetoothctl"""

    @staticmethod
    def scan_devices(duration: int = BT_SCAN_DURATION) -> List[dict]:
        """
        Scan for available Bluetooth devices
        Returns list of dicts with 'mac', 'name'
        
        Args:
            duration: Scan duration in seconds
        
        Returns:
            List of device dicts with 'mac' and 'name' keys
        """
        print(f"🔍 Starting Bluetooth scan for {duration} seconds...")
        try:
            # Start scan in background
            subprocess.run(["bluetoothctl", "scan", "on"], timeout=1)
        except subprocess.TimeoutExpired:
            pass  # Expected - scan runs in background

        time.sleep(duration)

        # Stop scan
        subprocess.run(["bluetoothctl", "scan", "off"])

        # Get discovered devices
        result = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True)

        devices = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split(None, 1)
            if len(parts) == 2:
                mac, name = parts
                devices.append({"mac": mac, "name": name})

        return devices

    @staticmethod
    def get_paired_devices() -> List[dict]:
        """
        Get list of paired Bluetooth devices
        
        Returns:
            List of device dicts with 'mac' and 'name' keys
        """
        print("📋 Fetching paired devices...")
        try:
            result = subprocess.run(["bluetoothctl", "paired-devices"], capture_output=True, text=True)

            devices = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split(None, 1)
                if len(parts) == 2:
                    mac, name = parts
                    devices.append({"mac": mac, "name": name})

            return devices
        except Exception as e:
            print(f"❌ Error getting paired devices: {e}")
            return []

    @staticmethod
    def get_connected_devices() -> List[dict]:
        """
        Get list of currently connected Bluetooth devices
        
        Returns:
            List of connected device dicts with 'mac' and 'name' keys
        """
        print("📡 Fetching connected devices...")
        try:
            paired = BluetoothManager.get_paired_devices()
            connected = []

            for device in paired:
                # Check if device is connected
                try:
                    mac = _validate_mac(device['mac'])
                except ValueError:
                    continue
                result = subprocess.run(["bluetoothctl", "info", mac], capture_output=True, text=True)
                if "Connected: yes" in result.stdout:
                    connected.append(device)

            return connected
        except Exception as e:
            print(f"❌ Error getting connected devices: {e}")
            return []

    @staticmethod
    def pair_device(mac: str) -> bool:
        """
        Pair with a Bluetooth device
        
        Args:
            mac: Bluetooth MAC address
        
        Returns:
            True if pairing successful, False otherwise
        """
        print(f"🔗 Attempting to pair with {mac}...")
        try:
            mac = _validate_mac(mac)

            # Trust device first (for auto-connection)
            subprocess.run(["bluetoothctl", "trust", mac], timeout=5)

            # Attempt pairing
            result = subprocess.run(
                ["bluetoothctl", "pair", mac],
                capture_output=True,
                text=True,
                timeout=BT_PAIR_TIMEOUT
            )

            if result.returncode == 0:
                print(f"✅ Successfully paired with {mac}")
                return True
            else:
                print(f"❌ Pairing failed: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            print(f"❌ Pairing timeout for {mac}")
            return False
        except Exception as e:
            print(f"❌ Pairing exception: {e}")
            return False

    @staticmethod
    def connect_device(mac: str) -> bool:
        """
        Connect to paired Bluetooth device
        
        Args:
            mac: Bluetooth MAC address
        
        Returns:
            True if connection successful, False otherwise
        """
        print(f"📞 Attempting to connect to {mac}...")
        try:
            mac = _validate_mac(mac)
            result = subprocess.run(
                ["bluetoothctl", "connect", mac],
                capture_output=True,
                text=True,
                timeout=BT_CONNECT_TIMEOUT
            )

            if result.returncode == 0:
                print(f"✅ Successfully connected to {mac}")
                return True
            else:
                print(f"❌ Connection failed: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            print(f"❌ Connection timeout for {mac}")
            return False
        except Exception as e:
            print(f"❌ Connection exception: {e}")
            return False

    @staticmethod
    def disconnect_device(mac: str) -> bool:
        """
        Disconnect from Bluetooth device
        
        Args:
            mac: Bluetooth MAC address
        
        Returns:
            True if disconnection successful, False otherwise
        """
        print(f"🔌 Disconnecting from {mac}...")
        try:
            mac = _validate_mac(mac)
            result = subprocess.run(
                ["bluetoothctl", "disconnect", mac],
                capture_output=True,
                text=True,
                timeout=BT_DISCONNECT_TIMEOUT
            )

            if result.returncode == 0:
                print(f"✅ Successfully disconnected from {mac}")
                return True
            else:
                print(f"❌ Disconnect failed: {result.stderr}")
                return False
        except Exception as e:
            print(f"❌ Disconnect exception: {e}")
            return False

    @staticmethod
    def remove_device(mac: str) -> bool:
        """
        Remove (forget) a paired Bluetooth device
        
        Args:
            mac: Bluetooth MAC address
        
        Returns:
            True if removal successful, False otherwise
        """
        print(f"🗑️  Removing device {mac}...")
        try:
            mac = _validate_mac(mac)
            result = subprocess.run(
                ["bluetoothctl", "remove", mac],
                capture_output=True,
                text=True,
                timeout=BT_REMOVE_TIMEOUT
            )

            if result.returncode == 0:
                print(f"✅ Successfully removed device {mac}")
                return True
            else:
                print(f"❌ Remove failed: {result.stderr}")
                return False
        except Exception as e:
            print(f"❌ Remove exception: {e}")
            return False
