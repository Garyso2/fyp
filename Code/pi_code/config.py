#!/usr/bin/env python3
"""
⚙️ Pi System Configuration File
All device-related configurations and constants are centralized here
"""

import os

# =============== Device Identity ===============
DEVICE_ID = "PI_001"  # Unique device identifier
DEVICE_NAME = "Smart Glasses V1"  # Device name

# =============== Supabase Configuration ===============
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://iobnjmawpmtzsiojkauo.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYm5qbWF3cG10enNpb2prYXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjMwOTksImV4cCI6MjA4NTQ5OTA5OX0.uV0rzfM2T-K3Z-0l7gPfBOKTqF6B4KCz0KnCHWOm-LI")

# =============== Server Configuration ===============
SERVER_IP = os.getenv("SERVER_IP", "100.125.29.38")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))
API_KEY = os.getenv("API_KEY", "yoloProject2026")

# =============== Directory Settings ===============
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.join(BASE_DIR, "run")

# Ensure run directory exists
os.makedirs(RUN_DIR, exist_ok=True)

# =============== Online Vision Settings ===============
WALK_LOOP_DELAY = 0.8
SPEECH_COOLDOWN = 4.0
DANGER_COOLDOWN = 10.0

# =============== Hardware Monitoring Settings ===============
ULTRASONIC_WARN_MIN = 1.0   # metres — below this distance: silent (already too close)
ULTRASONIC_WARN_MAX = 2.5   # metres — above this distance: no warning (too far)
ULTRASONIC_CHECK_INTERVAL = 0.2  # 200ms check interval

GYRO_DANGER_THRESHOLD = 300  # Angular velocity threshold (degrees/sec)
GYRO_CHECK_INTERVAL = 0.2  # 200ms check interval

# Activity Logging Limit
ACTIVITY_LOG_COOLDOWN = 5  # Max one report per 5 seconds for same event type

if __name__ == "__main__":
    print(f"Device ID: {DEVICE_ID}")
    print(f"Device Name: {DEVICE_NAME}")
    print(f"Server: {SERVER_IP}:{SERVER_PORT}")
    print(f"Run Directory: {RUN_DIR}")
