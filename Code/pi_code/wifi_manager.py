# ================== 🌐 WiFi Manager ==================

import subprocess
import time
from typing import List
from constants import (
    WIFI_CONNECT_TIMEOUT,
    WIFI_RESCAN_INTERVAL,
    WIFI_MAX_SSIDS,
    TIMEOUT_LIMIT
)


class WiFiManager:
    """Manage WiFi network scanning and connection via nmcli"""

    @staticmethod
    def rescan():
        """Rescan available WiFi networks"""
        print("🔄 Rescanning WiFi networks...")
        subprocess.run("sudo nmcli dev wifi rescan", shell=True)

    @staticmethod
    def get_nearby_ssids() -> List[str]:
        """
        Get list of nearby WiFi SSIDs
        
        Returns:
            List of SSID strings (max WIFI_MAX_SSIDS items)
        """
        cmd = "sudo nmcli -t -f SSID dev wifi | grep -v '^--' | grep -v '^$' | sort -u"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        ssids = [s for s in result.stdout.strip().split('\n') if s]
        return ssids[:WIFI_MAX_SSIDS]

    @staticmethod
    def connect(ssid: str, password: str) -> bool:
        """
        Connect to WiFi network
        
        Args:
            ssid: WiFi network SSID
            password: WiFi password
        
        Returns:
            True if connection succeeds or already connected, False otherwise
        """
        print(f"🔌 Attempting to connect to: {ssid}")

        try:
            # ★ First check if already connected to this network
            status_cmd = f"sudo nmcli -t -f ACTIVE,SSID dev wifi | grep '^yes' | cut -d: -f2"
            status_result = subprocess.run(status_cmd, shell=True, capture_output=True, text=True)
            current_ssid = status_result.stdout.strip()

            if current_ssid == ssid:
                print(f"✅ Already connected to: {ssid}")
                return True

            # ★ Attempt to connect to new network
            connect_cmd = f'sudo nmcli -t dev wifi connect "{ssid}" password "{password}" ifname wlan0'
            print(f"Executing connection command...")

            result = subprocess.run(
                connect_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=WIFI_CONNECT_TIMEOUT
            )

            print(f"Return code: {result.returncode}")
            print(f"Standard output: {result.stdout}")
            print(f"Standard error: {result.stderr}")

            if result.returncode == 0:
                print(f"✅ Successfully connected to: {ssid}")
                return True
            else:
                print(f"❌ Connection failed (return code: {result.returncode})")

                # Try alternative method
                if "Error" in result.stderr or "error" in result.stderr:
                    print(f"⚠️ Error: {result.stderr}")

                return False

        except subprocess.TimeoutExpired:
            print(f"❌ Connection timeout ({WIFI_CONNECT_TIMEOUT} seconds)")
            return False
        except Exception as e:
            print(f"❌ Connection exception: {e}")
            return False

    @staticmethod
    def get_connection_status() -> tuple:
        """
        Get current WiFi connection status
        
        Returns:
            Tuple of (is_connected: bool, ssid: str or None)
        """
        try:
            status_cmd = f"sudo nmcli -t -f ACTIVE,SSID dev wifi | grep '^yes' | cut -d: -f2"
            status_result = subprocess.run(status_cmd, shell=True, capture_output=True, text=True)
            current_ssid = status_result.stdout.strip()

            if current_ssid:
                return True, current_ssid
            else:
                return False, None
        except Exception as e:
            print(f"❌ Error getting connection status: {e}")
            return False, None
