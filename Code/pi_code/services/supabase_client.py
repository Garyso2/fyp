#!/usr/bin/env python3
"""
🌐 Supabase Pi Client
Communicates with Supabase database to report device safety events
"""

import requests
import json
import socket
import time
from datetime import datetime, timezone
from typing import Dict, Optional
import sys

# Import configuration
from config import SUPABASE_URL, SUPABASE_KEY, DEVICE_ID

class SupabaseClient:
    def __init__(self, url: str, key: str, device_id: str):
        """
        Initialize Supabase client
        
        Args:
            url: Supabase project URL
            key: Supabase anonymous key (anon key)
            device_id: Device ID
        """
        self.url = url
        self.key = key
        self.device_id = device_id
        self.headers = {
            'apikey': key,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        self.timeout = 5  # 5 seconds timeout
    
    def is_online(self) -> bool:
        """
        Check network connectivity status
        Returns True if internet connection is available
        """
        try:
            # Try connecting to Google DNS
            socket.create_connection(("8.8.8.8", 53), timeout=2)
            return True
        except (socket.timeout, socket.error):
            try:
                # Fallback: Try connecting to Cloudflare DNS
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
        Report activity log to Supabase
        
        Args:
            activity_type: Activity type ('ultrasonic' or 'gyroscope')
            detected_content: Details of detected content
            image_url: Image URL (optional)
        
        Returns:
            True if report succeeds, False otherwise
        """
        # 1. Check network connection
        if not self.is_online():
            print("❌ [Supabase] No network connection, cannot report")
            return False
        
        try:
            # 2. Prepare data
            current_time = datetime.now(timezone.utc).isoformat()
            payload = {
                'device_id': self.device_id,
                'activity_type': activity_type,
                'detected_content': detected_content,
                'image_url': image_url,
                'time': current_time
            }
            
            # 3. Send POST request to Supabase
            response = requests.post(
                f'{self.url}/rest/v1/activity_logs',
                json=payload,
                headers=self.headers,
                timeout=self.timeout
            )
            
            # 4. Check response
            if response.status_code in [200, 201]:
                print(f"✅ [Supabase] Log report successful: {activity_type} - {detected_content}")
                return True
            else:
                print(f"❌ [Supabase] Report failed (HTTP {response.status_code}): {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            print("❌ [Supabase] Request timeout")
            return False
        except requests.exceptions.ConnectionError:
            print("❌ [Supabase] Connection error")
            return False
        except Exception as e:
            print(f"❌ [Supabase] Unknown error: {e}")
            return False
    
    def update_device_status(
        self,
        battery_level: Optional[int],
        is_online: bool
    ) -> bool:
        """
        Update device status (battery level, online status)
        If record doesn't exist, create it first
        
        Args:
            battery_level: Battery percentage (0-100), or None if no battery hardware
            is_online: Whether device is online
        
        Returns:
            True if update succeeds, False otherwise
        """
        if not self.is_online():
            return False
        
        try:
            payload = {
                'is_online': is_online,
                'last_updated': datetime.now(timezone.utc).isoformat()
            }
            # Only include battery_level if we have a real reading
            if battery_level is not None:
                payload['battery_level'] = battery_level

            # Try UPDATE first
            response = requests.patch(
                f'{self.url}/rest/v1/device_status?device_id=eq.{self.device_id}',
                json=payload,
                headers=self.headers,
                timeout=self.timeout
            )
            
            if response.status_code in [200, 204]:
                level_str = f"{battery_level}%" if battery_level is not None else "N/A"
                print(f"✅ [Supabase] Device status updated: {level_str}")
                return True
            
            # If UPDATE failed or returned no rows, try INSERT
            if response.status_code == 206 or '[]' in response.text:  # No rows matched
                print(f"📝 [Supabase] Record not found, creating new device_status record...")
                
                insert_payload = {
                    'device_id': self.device_id,
                    'is_online': is_online,
                    'last_updated': datetime.now(timezone.utc).isoformat()
                }
                if battery_level is not None:
                    insert_payload['battery_level'] = battery_level
                
                insert_response = requests.post(
                    f'{self.url}/rest/v1/device_status',
                    json=insert_payload,
                    headers=self.headers,
                    timeout=self.timeout
                )
                
                if insert_response.status_code in [200, 201]:
                    level_str = f"{battery_level}%" if battery_level is not None else "N/A"
                    print(f"✅ [Supabase] Device status record created: {level_str}")
                    return True
                else:
                    print(f"❌ [Supabase] Failed to create status record: {insert_response.text}")
                    return False
            else:
                print(f"⚠️  [Supabase] Status update failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ [Supabase] Status update error: {e}")
            return False


# ============ Global Supabase Client Instance ============
# Configuration imported from config.py
supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY, DEVICE_ID)


if __name__ == "__main__":
    # For testing
    print("Testing Supabase connection...")
    result = supabase.log_activity(
        activity_type="test",
        detected_content="Test connection"
    )
    print(f"Result: {result}")
