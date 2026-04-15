# ================== 🔵 BLE Server - VisualGuard Pi ==================

import asyncio
import json
import threading
import time
from typing import Optional
from bless import (
    BlessServer,
    GATTCharacteristicProperties,
    GATTAttributePermissions
)
from constants import SERVICE_UUID, CHAR_UUID, TIMEOUT_LIMIT
from bluetooth_manager import BluetoothManager
from wifi_manager import WiFiManager
from config import DEVICE_ID, DEVICE_NAME  # 🔴 Import device config


class VisualGuardServer:
    """
    BLE Server for VisualGuard Pi device
    Handles WiFi and Bluetooth setup commands from mobile app
    """

    def __init__(self, name: str):
        """
        Initialize BLE Server
        
        Args:
            name: Server name (displayed as BLE device name)
        """
        self.name = name
        self.server: Optional[BlessServer] = None
        self.is_connected_to_wifi = False
        self.loop = None
        self.scan_thread = None
        self.abort_tasks = False

    def notify_client(self, message: str):
        """
        Send notification to connected mobile app
        
        Args:
            message: Message to send (auto-encodes to UTF-8 if string)
        """
        if self.server:
            try:
                print(f"📡 [BLE] Sending notification: {message}")
                # Ensure message is properly encoded
                if isinstance(message, str):
                    message_bytes = message.encode('utf-8')
                else:
                    message_bytes = message

                # Set the characteristic value
                char = self.server.get_characteristic(CHAR_UUID)
                char.value = message_bytes
                
                # Update value to trigger notification
                self.server.update_value(SERVICE_UUID, CHAR_UUID)
                print(f"✅ [BLE] Notification sent successfully, length: {len(message_bytes)} bytes, content: {message}")
                
            except Exception as e:
                print(f"❌ [BLE] Failed to send notification: {e}")
                import traceback
                traceback.print_exc()
                self.abort_tasks = True
                self.is_connected_to_wifi = False
        else:
            print(f"⚠️ [BLE] Server not initialized, unable to send notification: {message}")

    def _bluetooth_scan_loop(self):
        """Scan for Bluetooth devices in background"""
        print("🔄 [Thread] Starting continuous Bluetooth scan...")
        scan_count = 0
        while not self.abort_tasks and scan_count < 3:  # Scan 3 times (15 seconds total)
            devices = BluetoothManager.scan_devices(duration=5)
            if devices and not self.abort_tasks:
                self.notify_client(json.dumps({"type": "available_devices", "devices": devices}))
            scan_count += 1

    def _pair_bt_task(self, mac: str):
        """Pair with Bluetooth device in background"""
        print(f"⏳ [Thread] Starting pairing with {mac}...")
        try:
            success = BluetoothManager.pair_device(mac)
            if success:
                self.notify_client("BT_SUCCESS")
            else:
                self.notify_client("BT_FAIL")
        except Exception as e:
            print(f"❌ Pairing exception: {e}")
            self.notify_client("BT_FAIL")

    def _connect_bt_task(self, mac: str):
        """Connect to paired Bluetooth device in background"""
        print(f"⏳ [Thread] Starting connection to {mac}...")
        try:
            success = BluetoothManager.connect_device(mac)
            if success:
                self.notify_client("BT_SUCCESS")
            else:
                self.notify_client("BT_FAIL")
        except Exception as e:
            print(f"❌ Connection exception: {e}")
            self.notify_client("BT_FAIL")

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

    def _wifi_connection_task(self, ssid: str, password: str):
        """Connect to WiFi network in background"""
        print(f"⏳ [Thread] Starting WiFi connection attempt to {ssid}...")
        print("🛑 [Thread] Stopping WiFi scan thread to avoid notification conflicts...")
        self.abort_tasks = True  # 🔴 CRITICAL: Stop scan thread FIRST
        
        # Wait for scan thread to stop
        time.sleep(0.5)
        
        try:
            start_time = time.time()

            # Attempt WiFi connection
            success = WiFiManager.connect(ssid, password)
            elapsed_time = time.time() - start_time

            if success:
                self.is_connected_to_wifi = True
                print("✅ [WiFi] Connection successful!")
                
                # 🔴 Send device info with success status to DB
                success_response = json.dumps({
                    "status": "WIFI_SUCCESS",
                    "device_id": DEVICE_ID,
                    "device_name": DEVICE_NAME,
                    "message": "Device connected to WiFi and ready"
                })
                
                # Send response multiple times to ensure delivery
                for i in range(3):
                    self.notify_client(success_response)
                    print(f"📡 [WiFi] Sent success response ({i+1}/3): {DEVICE_ID}")
                    time.sleep(0.2)
                    
            elif elapsed_time > TIMEOUT_LIMIT:
                print(f"❌ [WiFi] Connection exceeded {TIMEOUT_LIMIT} seconds, timeout triggered")
                self.notify_client("WIFI_TIMEOUT")
            else:
                print("❌ [WiFi] Connection failed, please check SSID/password or network status")
                self.notify_client("WIFI_FAIL")

        except Exception as e:
            print(f"❌ [WiFi] Connection exception: {e}")
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

        # ========== BLUETOOTH COMMANDS ==========
        if command == "SCAN_BT":
            """Scan for available Bluetooth devices"""
            self.abort_tasks = False
            if not self.scan_thread or not self.scan_thread.is_alive():
                print("🔄 Starting Bluetooth scan thread...")
                self.scan_thread = threading.Thread(target=self._bluetooth_scan_loop, daemon=True)
                self.scan_thread.start()
            else:
                print("ℹ️  Bluetooth scan thread already running")
        
        elif command == "GET_PAIRED_BT":
            """Get list of paired Bluetooth devices"""
            paired = BluetoothManager.get_paired_devices()
            connected = BluetoothManager.get_connected_devices()
            response = json.dumps({
                "type": "paired_devices",
                "devices": paired,
                "connected": connected
            })
            self.notify_client(response)
        
        elif command == "CANCEL_BT_SETUP":
            """Cancel Bluetooth setup"""
            self.abort_tasks = True
            print("✋ Bluetooth setup cancelled")
            self.notify_client("BT_CANCELLED")
        
        elif command.startswith("PAIR_BT:"):
            """Pair with Bluetooth device: PAIR_BT:<mac>"""
            mac = command.split(":", 1)[1]
            conn_thread = threading.Thread(target=self._pair_bt_task, args=(mac,), daemon=True)
            conn_thread.start()
        
        elif command.startswith("CONNECT_BT:"):
            """Connect to paired Bluetooth device: CONNECT_BT:<mac>"""
            mac = command.split(":", 1)[1]
            conn_thread = threading.Thread(target=self._connect_bt_task, args=(mac,), daemon=True)
            conn_thread.start()
        
        elif command.startswith("DISCONNECT_BT:"):
            """Disconnect from Bluetooth device: DISCONNECT_BT:<mac>"""
            mac = command.split(":", 1)[1]
            success = BluetoothManager.disconnect_device(mac)
            self.notify_client("BT_SUCCESS" if success else "BT_FAIL")
        
        elif command.startswith("REMOVE_BT:"):
            """Remove (forget) Bluetooth device: REMOVE_BT:<mac>"""
            mac = command.split(":", 1)[1]
            success = BluetoothManager.remove_device(mac)
            self.notify_client("BT_SUCCESS" if success else "BT_FAIL")

        # ========== WIFI COMMANDS ==========
        elif command == "CANCEL_SETUP":
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

                print(f"📡 Starting WiFi connection: SSID={ssid}, Password=***")
                conn_thread = threading.Thread(target=self._wifi_connection_task, args=(ssid, pwd), daemon=True)
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