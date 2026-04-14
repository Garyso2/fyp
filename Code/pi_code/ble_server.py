import asyncio
import json
import subprocess
import threading
import time
from typing import List, Optional
from bless import (
    BlessServer,
    BlessGATTCharacteristic,
    GATTCharacteristicProperties,
    GATTAttributePermissions
)

# --- Constants Configuration ---
SERVICE_UUID = "A07498CA-AD5B-474E-940D-16F1FBE7E8CD"
CHAR_UUID = "51FF12CB-FDF0-4222-800F-B91F37D3D224"
TIMEOUT_LIMIT = 180  # 3 minutes (seconds)

class WiFiManager:
    @staticmethod
    def rescan():
        subprocess.run("sudo nmcli dev wifi rescan", shell=True)

    @staticmethod
    def get_nearby_ssids() -> List[str]:
        cmd = "sudo nmcli -t -f SSID dev wifi | grep -v '^--' | grep -v '^$' | sort -u"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        ssids = [s for s in result.stdout.strip().split('\n') if s]
        return ssids[:10]

    @staticmethod
    def connect(ssid, password) -> bool:
        """
        Connect to WiFi network
        Returns True if connection succeeds or already connected, False otherwise
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
            
            # ★ Attempt to connect to new network (with increased timeout)
            connect_cmd = f'sudo nmcli -t dev wifi connect "{ssid}" password "{password}" ifname wlan0'
            print(f"Executing command: {connect_cmd}")
            
            result = subprocess.run(
                connect_cmd, 
                shell=True, 
                capture_output=True, 
                text=True,
                timeout=60  # ← Increased timeout to 60 seconds
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
            print(f"❌ Connection timeout (60 seconds)")
            return False
        except Exception as e:
            print(f"❌ Connection exception: {e}")
            return False

class VisualGuardServer:
    def __init__(self, name: str):
        self.name = name
        self.server: Optional[BlessServer] = None
        self.is_connected_to_wifi = False
        self.loop = None
        self.scan_thread = None
        self.abort_tasks = False

    def notify_client(self, message: str):
            if self.server:
                try:
                    print(f"📡 Sending notification to App: {message}")
                    # ★ Ensure message is properly encoded
                    if isinstance(message, str):
                        message = message.encode('utf-8')
                    
                    self.server.get_characteristic(CHAR_UUID).value = message
                    self.server.update_value(SERVICE_UUID, CHAR_UUID)
                    print(f"✅ Notification sent, message length: {len(message)}")
                except Exception as e:
                    print(f"❌ Failed to send notification: {e}")
                    self.abort_tasks = True
                    self.is_connected_to_wifi = False
            else:
                print(f"⚠️ Server not initialized, unable to send notification: {message}")

    def _wifi_scan_loop(self):
        print("🔄 [Thread] Starting continuous WiFi scan...")
        while not self.is_connected_to_wifi and not self.abort_tasks:
            WiFiManager.rescan()
            if self.abort_tasks: break 
            ssids = WiFiManager.get_nearby_ssids()
            if ssids and not self.abort_tasks:
                self.notify_client(json.dumps({"ssids": ssids}))
            for _ in range(10):
                if self.abort_tasks: break
                time.sleep(1)

    def _connection_task(self, ssid, password):
        print(f"⏳ [Thread] Starting connection attempt to {ssid}...")
        try:
            start_time = time.time()

            # Attempt WiFi connection
            success = WiFiManager.connect(ssid, password)
            elapsed_time = time.time() - start_time

            if success:
                self.is_connected_to_wifi = True
                print("✅ WiFi connection successful!")
                self.notify_client("WIFI_SUCCESS")
            elif elapsed_time > TIMEOUT_LIMIT:
                print(f"❌ Connection exceeded {TIMEOUT_LIMIT} seconds, timeout triggered")
                self.notify_client("WIFI_TIMEOUT")
            else:
                print("❌ WiFi connection failed, please check SSID/password or network status")
                self.notify_client("WIFI_FAIL")

        except Exception as e:
            print(f"❌ WiFi connection exception: {e}")
            self.notify_client("WIFI_FAIL")

    def handle_write(self, char, value, **kwargs):
        if value is None:
            print("⚠️ Received empty write value, ignoring")
            return

        try:
            command = value.decode("utf-8") if isinstance(value, (bytes, bytearray)) else str(value)
        except UnicodeDecodeError as e:
            print(f"❌ Cannot decode mobile command: {e}")
            self.notify_client("WIFI_FAIL")
            return

        print(f"\n📱 Received mobile command: {command}")

        if command == "CANCEL_SETUP":
            self.abort_tasks = True
            self.is_connected_to_wifi = False
            print("✋ Setup cancelled")
            self.notify_client("WIFI_CANCELLED")

        elif command == "SCAN_WIFI":
            self.abort_tasks = False
            self.is_connected_to_wifi = False
            if not self.scan_thread or not self.scan_thread.is_alive():
                print("🔄 Starting WiFi scan thread...")
                self.scan_thread = threading.Thread(target=self._wifi_scan_loop, daemon=True)
                self.scan_thread.start()
            else:
                print("ℹ️  WiFi scan thread already running")

        elif command.startswith("{"):
            try:
                data = json.loads(command)
                ssid = data.get("ssid")
                pwd = data.get("password")

                if not ssid or not pwd:
                    print(f"❌ Missing SSID or password: ssid={ssid}, pwd={'***' if pwd else 'None'}")
                    self.notify_client("WIFI_FAIL")
                    return

                print(f"📡 Starting connection: SSID={ssid}, Password=***")
                conn_thread = threading.Thread(target=self._connection_task, args=(ssid, pwd), daemon=True)
                conn_thread.start()

            except json.JSONDecodeError as e:
                print(f"❌ JSON parse failed: {e}")
                self.notify_client("WIFI_FAIL")

        else:
            print(f"⚠️ Unknown command: {command}")
            self.notify_client("WIFI_FAIL")

    async def setup(self):
        self.loop = asyncio.get_running_loop()
        self.server = BlessServer(name=self.name, loop=self.loop)
        self.server.read_request_func = lambda char, **kwargs: char.value
        self.server.write_request_func = self.handle_write
        await self.server.add_new_service(SERVICE_UUID)
        char_flags = (GATTCharacteristicProperties.read | GATTCharacteristicProperties.write | GATTCharacteristicProperties.notify)
        permissions = (GATTAttributePermissions.readable | GATTAttributePermissions.writeable)
        await self.server.add_new_characteristic(SERVICE_UUID, CHAR_UUID, char_flags, b"Ready", permissions)
        await self.server.start()
        print(f"🔵 {self.name} is online, waiting for connection...")

async def run_app():
    vg_server = VisualGuardServer("VisualGuard_Pi")
    await vg_server.setup()
    await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(run_app())
    except KeyboardInterrupt:
        print("\n🔴 Server closed")