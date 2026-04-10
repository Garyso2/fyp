#!/usr/bin/env python3
"""
🌐 Supabase Pi 客戶端
用嚟同 Supabase 數據庫通信，上報設備危險事件
"""

import requests
import json
import socket
import time
from datetime import datetime, timezone
from typing import Dict, Optional
import sys

class SupabaseClient:
    def __init__(self, url: str, key: str, device_id: str):
        """
        初始化 Supabase 客戶端
        
        Args:
            url: Supabase 項目 URL
            key: Supabase 匿名密鑰 (anon key)
            device_id: 設備 ID
        """
        self.url = url
        self.key = key
        self.device_id = device_id
        self.headers = {
            'apikey': key,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        self.timeout = 5  # 5秒超時
    
    def is_online(self) -> bool:
        """
        檢查網路連接狀態
        返回 True 如果有網際網路連接
        """
        try:
            # 嘗試連接到 Google DNS
            socket.create_connection(("8.8.8.8", 53), timeout=2)
            return True
        except (socket.timeout, socket.error):
            try:
                # 備用：嘗試連接到 Cloudflare DNS
                socket.create_connection(("1.1.1.1", 53), timeout=2)
                return True
            except (socket.timeout, socket.error):
                return False
    
    def log_activity(
        self, 
        activity_type: str, 
        detected_content: str,
        image_url: Optional[str] = None
    ) -> bool:
        """
        上報活動日誌到 Supabase
        
        Args:
            activity_type: 活動類型 ('ultrasonic' 或 'gyroscope')
            detected_content: 檢測內容詳情
            image_url: 圖片 URL (可選)
        
        Returns:
            True 如果上報成功，False 否則
        """
        # 1. 檢查網路連接
        if not self.is_online():
            print("❌ [Supabase] 無網路連接，無法上報")
            return False
        
        try:
            # 2. 準備數據
            current_time = datetime.now(timezone.utc).isoformat()
            payload = {
                'device_id': self.device_id,
                'activity_type': activity_type,
                'detected_content': detected_content,
                'image_url': image_url,
                'time': current_time
            }
            
            # 3. 向 Supabase 發送 POST 請求
            response = requests.post(
                f'{self.url}/rest/v1/activity_logs',
                json=payload,
                headers=self.headers,
                timeout=self.timeout
            )
            
            # 4. 檢查響應
            if response.status_code in [200, 201]:
                print(f"✅ [Supabase] 日誌上報成功: {activity_type} - {detected_content}")
                return True
            else:
                print(f"❌ [Supabase] 上報失敗 (HTTP {response.status_code}): {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            print("❌ [Supabase] 請求超時")
            return False
        except requests.exceptions.ConnectionError:
            print("❌ [Supabase] 連接錯誤")
            return False
        except Exception as e:
            print(f"❌ [Supabase] 未知錯誤: {e}")
            return False
    
    def update_device_status(
        self,
        battery_level: int,
        is_online: bool
    ) -> bool:
        """
        更新設備狀態 (電池電量、連線狀態)
        
        Args:
            battery_level: 電池百分比 (0-100)
            is_online: 是否在線
        
        Returns:
            True 如果更新成功，False 否則
        """
        if not self.is_online():
            return False
        
        try:
            payload = {
                'battery_level': battery_level,
                'is_online': is_online
            }
            
            response = requests.patch(
                f'{self.url}/rest/v1/device_status?device_id=eq.{self.device_id}',
                json=payload,
                headers=self.headers,
                timeout=self.timeout
            )
            
            if response.status_code in [200, 204]:
                print(f"✅ [Supabase] 設備狀態已更新")
                return True
            else:
                print(f"⚠️  [Supabase] 狀態更新失敗: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ [Supabase] 狀態更新錯誤: {e}")
            return False


# ============ 全域 Supabase 客戶端實例 ============
# 填入你的 Supabase 詳細資訊
SUPABASE_URL = "https://iobnjmawpmtzsiojkauo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYm5qbWF3cG10enNpb2prYXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjMwOTksImV4cCI6MjA4NTQ5OTA5OX0.uV0rzfM2T-K3Z-0l7gPfBOKTqF6B4KCz0KnCHWOm-LI"
DEVICE_ID = "PI_001"  # ⚠️ 改成你的設備 ID

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY, DEVICE_ID)


if __name__ == "__main__":
    # 測試用
    print("Testing Supabase connection...")
    result = supabase.log_activity(
        activity_type="test",
        detected_content="測試連接"
    )
    print(f"Result: {result}")
