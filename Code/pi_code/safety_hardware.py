#!/usr/bin/env python3
"""
🛡️ Safety Hardware Monitoring System (Pi5)
Monitors ultrasonic sensor and gyroscope to detect dangerous situations and reports to Supabase
"""

import time
import math
import subprocess
import sys
from gpiozero import DistanceSensor
from mpu6050 import mpu6050
import os

# Import configuration and Supabase client
from config import DEVICE_ID, ULTRASONIC_DANGER_DISTANCE, ULTRASONIC_CHECK_INTERVAL, GYRO_DANGER_THRESHOLD, GYRO_CHECK_INTERVAL, ACTIVITY_LOG_COOLDOWN

try:
    from supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("⚠️  Warning: Supabase client not found, running in local mode")

# Force Python to output immediately, don't buffer prints
sys.stdout.reconfigure(line_buffering=True)

# =============== Hardware Initialization ===============
try: 
    ultrasonic = DistanceSensor(echo=24, trigger=23, max_distance=2.0)
    print("✅ [Hardware] Ultrasonic sensor connected successfully!")
except Exception as e: 
    ultrasonic = None
    print(f"❌ [Hardware] Ultrasonic connection failed: {e}")

try: 
    gyro = mpu6050(0x68)
    print("✅ [Hardware] Gyroscope connected successfully!")
except Exception as e: 
    gyro = None
    print(f"❌ [Hardware] Gyroscope connection failed: {e}")

# =============== Monitoring Parameters ===============
# All parameters imported from config.py

# =============== Global State ===============
last_danger_time = {}  # {'ultrasonic': timestamp, 'gyroscope': timestamp}
loop_count = 0  # Counter for displaying heartbeat

def speak(text):
    """Emergency voice alert (priority TTS to interrupt AI voice)"""
    print(f"🔊 Hardware emergency alert: {text}")
    
    # 1. Create "danger lock" file to warn AI program not to speak
    try:
        with open("/tmp/danger.lock", "w") as f:
            f.write(str(time.time()))
    except: pass
    
    # 2. Kill any running AI voice (mpg123)
    subprocess.run(["pkill", "-f", "mpg123"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "espeak"], stderr=subprocess.DEVNULL)
    
    # 3. Use fastest possible speech (0 second delay for emergency)
    subprocess.Popen(["espeak", "-v", "en-us", "-s", "160", text], stderr=subprocess.DEVNULL)

def can_report_danger(sensor_type: str) -> bool:
    """
    Check if danger can be reported (prevent duplicate reports)
    
    Args:
        sensor_type: 'ultrasonic' or 'gyroscope'
    
    Returns:
        True if can report, False if in cooldown period
    """
    current_time = time.time()
    last_time = last_danger_time.get(sensor_type, 0)
    
    if current_time - last_time >= ACTIVITY_LOG_COOLDOWN:
        last_danger_time[sensor_type] = current_time
        return True
    return False

def report_danger(activity_type: str, content: str):
    """
    Report dangerous event to Supabase
    
    Args:
        activity_type: 'ultrasonic' or 'gyroscope'
        content: Detailed danger description
    """
    if not HAS_SUPABASE:
        print(f"⚠️  Cannot report (Supabase unavailable): {activity_type} - {content}")
        return
    
    # Sync report (non-blocking to avoid blocking monitoring loop)
    try:
        supabase.log_activity(
            activity_type=activity_type,
            detected_content=content
        )
    except Exception as e:
        print(f"❌ Report failed: {e}")

def check_ultrasonic():
    """Check ultrasonic sensor to detect objects too close"""
    if ultrasonic is None:
        return
    
    try:
        distance = ultrasonic.distance  # Distance in meters
        distance_cm = distance * 100  # Convert to centimeters
        
        if distance < ULTRASONIC_DANGER_DISTANCE:
            # Danger: object too close
            speak(f"Warning! Object detected at {distance_cm:.1f} centimeters!")
            
            if can_report_danger('ultrasonic'):
                content = f"Object detected in front at distance {distance_cm:.1f} cm"
                report_danger('ultrasonic', content)
                print(f"⚠️  [Danger] Ultrasonic: {content}")
    
    except Exception as e:
        print(f"❌ Ultrasonic reading failed: {e}")

def check_gyroscope():
    """Check gyroscope to detect excessive shaking (possible fall)"""
    if gyro is None:
        return
    
    try:
        # Read angular velocity (unit: degrees/second)
        gyro_data = gyro.get_gyro_data()
        gyro_x = gyro_data['x']
        gyro_y = gyro_data['y']
        gyro_z = gyro_data['z']
        
        # Calculate total angular velocity magnitude
        total_gyro = math.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
        
        if total_gyro > GYRO_DANGER_THRESHOLD:
            # Danger: excessive shaking, possible fall or injury
            speak("Alert! Device is shaking violently! Possible fall detected!")
            
            if can_report_danger('gyroscope'):
                content = f"Fall detection - Excessive shaking detected (angular velocity: {total_gyro:.1f}°/s)"
                report_danger('gyroscope', content)
                print(f"⚠️  [Danger] Gyroscope: {content}")
    
    except Exception as e:
        print(f"❌ Gyroscope reading failed: {e}")

def main():
    """Main monitoring loop"""
    global loop_count
    
    print("\n" + "="*50)
    print("🛡️  Safety Hardware Monitoring System Started")
    print("="*50)
    
    try:
        while True:
            loop_count += 1
            
            # Print heartbeat every 50 loops
            if loop_count % 50 == 0:
                print(f"💓 [Heartbeat] Monitoring running... (loop {loop_count})")
            
            # Check ultrasonic sensor
            check_ultrasonic()
            time.sleep(ULTRASONIC_CHECK_INTERVAL)
            
            # Check gyroscope
            check_gyroscope()
            time.sleep(GYRO_CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n✋ [System] Hardware monitoring stopped")
        sys.exit(0)
    except Exception as e:
        print(f"❌ [System] Error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()