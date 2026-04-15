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

            # ★ 🔴 IMPORTANT: Use 'device' instead of 'dev wifi connect' for better compatibility
            # This method explicitly adds security settings to avoid 'key-mgmt' errors
            
            # First, try to remove any existing connection with same SSID
            remove_cmd = f'sudo nmcli connection delete "{ssid}" 2>/dev/null || true'
            subprocess.run(remove_cmd, shell=True, capture_output=True)
            print(f"Cleared previous connection profile")

            # Use device connect method with explicit WPA2 password
            connect_cmd = f'sudo nmcli device wifi connect "{ssid}" password "{password}" ifname wlan0 -- ipv4.method auto ipv4.dhcp-timeout 15000'
            print(f"📡 Executing connection command...")

            result = subprocess.run(
                connect_cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=WIFI_CONNECT_TIMEOUT
            )

            print(f"Return code: {result.returncode}")
            print(f"Standard output: {result.stdout}")
            if result.stderr:
                print(f"Standard error: {result.stderr}")

            if result.returncode == 0:
                # ✅ Connection successful, verify connection
                time.sleep(2)  # Wait for connection to stabilize
                verify_cmd = "ip route | grep default"
                verify_result = subprocess.run(verify_cmd, shell=True, capture_output=True, text=True)
                
                if verify_result.stdout.strip():
                    print(f"✅ Successfully connected to: {ssid}")
                    print(f"📍 Internet route: {verify_result.stdout.strip()}")
                    return True
                else:
                    print(f"⚠️ Connection command succeeded but no default route yet")
                    return False
            else:
                print(f"❌ Connection failed (return code: {result.returncode})")

                # If connection failed, try alternative with explicit security
                if "key-mgmt" in result.stderr or "security" in result.stderr.lower():
                    print(f"🔧 Trying alternative connection method with WPA2...")
                    alt_cmd = f'sudo nmcli connection add type wifi con-name "{ssid}" ifname wlan0 ssid "{ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "{password}" autoconnect yes && sudo nmcli connection up "{ssid}"'
                    
                    alt_result = subprocess.run(alt_cmd, shell=True, capture_output=True, text=True, timeout=WIFI_CONNECT_TIMEOUT)
                    print(f"Alternative connection result: {alt_result.returncode}")
                    if alt_result.returncode == 0:
                        print(f"✅ Successfully connected via alternative method!")
                        return True
                    else:
                        print(f"❌ Alternative method also failed: {alt_result.stderr}")
                        return False
                
                return False

        except subprocess.TimeoutExpired:
            print(f"❌ Connection timeout ({WIFI_CONNECT_TIMEOUT} seconds)")
            return False
        except Exception as e:
            print(f"❌ Connection exception: {e}")
            import traceback
            traceback.print_exc()
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
