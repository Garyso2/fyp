# ================== 🌐 WiFi Manager ==================

import subprocess
import time
from typing import List, Optional
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
    def _get_wifi_interface() -> Optional[str]:
        """Return the first available Wi-Fi interface managed by NetworkManager."""
        cmd = ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE", "device", "status"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return None

        for line in result.stdout.strip().split("\n"):
            fields = line.split(":")
            if len(fields) >= 3 and fields[1] == "wifi" and fields[2] != "unavailable":
                return fields[0]
        return None

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
            status_cmd = ["sudo", "nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi"]
            status_result = subprocess.run(status_cmd, capture_output=True, text=True)
            current_ssid = ""
            for line in status_result.stdout.strip().split("\n"):
                if line.startswith("yes:"):
                    current_ssid = line.split(":", 1)[1].strip()
                    break

            if current_ssid == ssid:
                print(f"✅ Already connected to: {ssid}")
                return True

            iface = WiFiManager._get_wifi_interface()
            if iface is None:
                print("❌ No Wi-Fi interface found")
                return False

            remove_cmd = ["sudo", "nmcli", "connection", "delete", ssid]
            subprocess.run(remove_cmd, capture_output=True, text=True)
            print(f"Cleared previous connection profile")

            subprocess.run(["sudo", "nmcli", "device", "wifi", "rescan", "ifname", iface], capture_output=True, text=True)

            connect_cmd = [
                "sudo",
                "nmcli",
                "device",
                "wifi",
                "connect",
                ssid,
                "password",
                password,
                "ifname",
                iface,
            ]
            print(f"📡 Executing connection command...")

            result = subprocess.run(
                connect_cmd,
                capture_output=True,
                text=True,
                timeout=WIFI_CONNECT_TIMEOUT
            )

            print(f"Return code: {result.returncode}")
            print(f"Standard output: {result.stdout}")
            if result.stderr:
                print(f"Standard error: {result.stderr}")

            if result.returncode == 0:
                time.sleep(2)
                verify_cmd = ["ip", "route"]
                verify_result = subprocess.run(verify_cmd, capture_output=True, text=True)
                if "default" in verify_result.stdout:
                    print(f"✅ Successfully connected to: {ssid}")
                    print(f"📍 Internet route: {verify_result.stdout.strip()}")
                    return True
                print("⚠️ Connection command succeeded but no default route yet")
                return False

            print(f"❌ Connection failed (return code: {result.returncode})")
            stderr = result.stderr.lower()
            if "key-mgmt" in stderr or "security" in stderr or "could not be found" in stderr or "network could not be found" in stderr:
                print(f"🔧 Trying alternative connection method with explicit profile...")
                alt_cmd = [
                    "sudo",
                    "nmcli",
                    "connection",
                    "add",
                    "type",
                    "wifi",
                    "con-name",
                    ssid,
                    "ifname",
                    iface,
                    "ssid",
                    ssid,
                    "wifi-sec.key-mgmt",
                    "wpa-psk",
                    "wifi-sec.psk",
                    password,
                    "autoconnect",
                    "yes",
                ]
                alt_result = subprocess.run(
                    alt_cmd,
                    capture_output=True,
                    text=True,
                    timeout=WIFI_CONNECT_TIMEOUT
                )
                if alt_result.returncode == 0:
                    up_cmd = ["sudo", "nmcli", "connection", "up", ssid]
                    up_result = subprocess.run(up_cmd, capture_output=True, text=True, timeout=WIFI_CONNECT_TIMEOUT)
                    print(f"Alternative connection result: {up_result.returncode}")
                    if up_result.returncode == 0:
                        print("✅ Successfully connected via alternative method!")
                        return True
                    print(f"❌ Alternative connection up failed: {up_result.stderr}")
                    return False
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
