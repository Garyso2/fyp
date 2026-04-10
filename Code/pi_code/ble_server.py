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

# --- 常量設定 ---
SERVICE_UUID = "A07498CA-AD5B-474E-940D-16F1FBE7E8CD"
CHAR_UUID = "51FF12CB-FDF0-4222-800F-B91F37D3D224"
TIMEOUT_LIMIT = 180  # 3 分鐘 (秒)

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
        cmd = f'sudo nmcli dev wifi connect "{ssid}" password "{password}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.returncode == 0

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
                    print(f"📡 發送通知至 App: {message}")
                    self.server.get_characteristic(CHAR_UUID).value = message.encode('utf-8')
                    self.server.update_value(SERVICE_UUID, CHAR_UUID)
                except Exception as e:
                    print(f"⚠️ 發送失敗: {e}")
                    self.abort_tasks = True
                    self.is_connected_to_wifi = False

    def _wifi_scan_loop(self):
        print("🔄 [Thread] 啟動持續 WiFi 掃描...")
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
        print(f"⏳ [Thread] 開始嘗試連線 {ssid}...")
        start_time = time.time()
        success = WiFiManager.connect(ssid, password)
        elapsed_time = time.time() - start_time
        if success:
            self.is_connected_to_wifi = True
            print("✅ WiFi 連線成功！")
            self.notify_client("WIFI_SUCCESS")
        elif elapsed_time > TIMEOUT_LIMIT:
            print(f"❌ 連線超過 {TIMEOUT_LIMIT} 秒，觸發 Timeout")
            self.notify_client("WIFI_TIMEOUT")
        else:
            print("❌ 連線失敗 (密碼錯誤或訊號問題)")
            self.notify_client("WIFI_FAIL")

    def handle_write(self, char: BlessGATTCharacteristic, value: bytes, **kwargs):
            command = value.decode('utf-8')
            print(f"\n📱 收到手機指令: {command}")
            if command == "CANCEL_SETUP":
                self.abort_tasks = True
                self.is_connected_to_wifi = False
            elif command == "SCAN_WIFI":
                self.abort_tasks = False
                self.is_connected_to_wifi = False
                if not self.scan_thread or not self.scan_thread.is_alive():
                    self.scan_thread = threading.Thread(target=self._wifi_scan_loop, daemon=True)
                    self.scan_thread.start()
            elif command.startswith("{"):
                try:
                    data = json.loads(command)
                    ssid = data.get("ssid")
                    pwd = data.get("password")
                    threading.Thread(target=self._connection_task, args=(ssid, pwd), daemon=True).start()
                except Exception as e:
                    print(f"⚠️ 指令解析錯誤: {e}")

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
        print(f"🔵 {self.name} 已上線，等待連線...")

async def run_app():
    vg_server = VisualGuardServer("VisualGuard_Pi")
    await vg_server.setup()
    await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(run_app())
    except KeyboardInterrupt:
        print("\n🔴 伺服器已關閉")