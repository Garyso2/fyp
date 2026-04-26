#!/usr/bin/env python3
"""
🛡️ Safety Hardware Monitoring System (Pi5)
Monitors ultrasonic sensor and gyroscope to detect dangerous situations and reports to Supabase
"""

import time
import math
import subprocess
import sys
import os

# Allow imports from pi_code root (config.py, services/) when run as a subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gpiozero import DistanceSensor
from mpu6050 import mpu6050
from config import DEVICE_ID, ULTRASONIC_WARN_MIN, ULTRASONIC_WARN_MAX, ULTRASONIC_SUPPRESS_BELOW, ULTRASONIC_CHECK_INTERVAL, GYRO_DANGER_THRESHOLD, GYRO_CHECK_INTERVAL, ACTIVITY_LOG_COOLDOWN

try:
    from services.supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("⚠️  Warning: Supabase client not found, running in local mode")

# Force Python to output immediately, don't buffer prints
sys.stdout.reconfigure(line_buffering=True)

# =============== Hardware Initialization ===============
try: 
    ultrasonic = DistanceSensor(echo=24, trigger=23, max_distance=2.5)
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
ultrasonic_consec = 0   # Consecutive close-object detection count
ultrasonic_was_clear = True  # Track whether object was absent last cycle
ultrasonic_passed_below_min = False  # True once distance dropped below 1 m; suppress re-entry warnings until clear
STOP_FLAG = "/tmp/system_stopped.flag"  # Written by voice_listener when stopped
_beep_process = None  # Track current beep subprocess
_speak_process = None  # Track current espeak subprocess

def beep():
    """Play a single short warning tone ("wong")"""
    global _beep_process
    # Terminate previous beep if still running
    if _beep_process and _beep_process.poll() is None:
        try:
            _beep_process.terminate()
            _beep_process.wait(timeout=0.5)
        except Exception:
            pass
    try:
        # Use speaker-test for a pure tone beep — short duration via timeout
        _beep_process = subprocess.Popen(
            ["speaker-test", "-t", "sine", "-f", "1000", "-l", "1"],
            stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL
        )
        # Kill after 0.3 seconds for a short beep
        import threading
        def _kill_beep():
            time.sleep(0.3)
            if _beep_process and _beep_process.poll() is None:
                try:
                    _beep_process.terminate()
                except Exception:
                    pass
        threading.Thread(target=_kill_beep, daemon=True).start()
    except Exception:
        try:
            # Fallback: use beep command
            _beep_process = subprocess.Popen(["beep", "-f", "1000", "-l", "300"], stderr=subprocess.DEVNULL)
        except Exception:
            pass  # Silent fail if neither available

def speak(text):
    """Emergency voice alert (priority TTS to interrupt AI voice)"""
    global _speak_process
    print(f"🔊 Hardware emergency alert: {text}")
    
    # 1. Create "danger lock" file to warn AI program not to speak
    try:
        with open("/tmp/danger.lock", "w") as f:
            f.write(str(time.time()))
    except: pass
    
    # 2. Kill only our own previous espeak process (not system-wide)
    if _speak_process and _speak_process.poll() is None:
        try:
            _speak_process.terminate()
            _speak_process.wait(timeout=0.5)
        except Exception:
            pass
    
    # 3. Use fastest possible speech (0 second delay for emergency)
    _speak_process = subprocess.Popen(["espeak", "-v", "en-us", "-s", "160", text], stderr=subprocess.DEVNULL)

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
    """Check ultrasonic sensor — warn only in 0.5–1.5 m zone.
    Once distance drops below 1 m, all warnings are suppressed until the object
    fully clears (> 1.5 m).
    """
    global ultrasonic_consec, ultrasonic_was_clear, ultrasonic_passed_below_min

    if ultrasonic is None:
        return
    
    try:
        distance = ultrasonic.distance  # Distance in metres
        distance_cm = distance * 100

        if distance > ULTRASONIC_WARN_MAX:
            # ── Clear zone (> 1.5 m) — reset all state ──────────────────────
            if not ultrasonic_was_clear:
                print("✅ [Ultrasonic] Object cleared, counter reset")
            ultrasonic_consec = 0
            ultrasonic_was_clear = True
            ultrasonic_passed_below_min = False

        elif distance < ULTRASONIC_WARN_MIN:
            # ── Too close zone (< 0.5 m) — completely silent, lock out future warnings ──
            ultrasonic_passed_below_min = True
            ultrasonic_was_clear = False
            print(f"ℹ️  [Ultrasonic] Below 0.5 m ({distance_cm:.1f} cm), no warning")

        else:
            # ── Warning zone (0.5 m – 1.5 m) ────────────────────────────────
            # Once distance drops below 1 m, suppress all further warnings
            if distance < ULTRASONIC_SUPPRESS_BELOW:
                ultrasonic_passed_below_min = True
                ultrasonic_was_clear = False

            if ultrasonic_passed_below_min:
                # Already dipped below 1 m — stay silent until object fully clears
                print(f"ℹ️  [Ultrasonic] Below 1 m, suppressed — {distance_cm:.1f} cm")
                return

            if ultrasonic_was_clear:
                # Object just entered warning zone — reset consecutive counter
                ultrasonic_consec = 0
                ultrasonic_was_clear = False

            if ultrasonic_consec < 3:
                beep()
                ultrasonic_consec += 1
                print(f"⚠️  [Ultrasonic] Warning beep #{ultrasonic_consec} — {distance_cm:.1f} cm")
                if ultrasonic_consec == 3:
                    speak(f"Warning! Object detected at {distance_cm:.1f} centimeters!")
                    content = f"Obstacle detected at {distance_cm:.1f} cm"
                    report_danger('OBSTACLE_WARNING', content)
                    # Signal offline vision to scan what's ahead
                    try:
                        with open("/tmp/obstacle_scan.trigger", "w") as _f:
                            _f.write(str(time.time()))
                        print("📡 [Ultrasonic] Obstacle scan trigger sent to vision.")
                    except Exception:
                        pass
            else:
                print(f"ℹ️  [Ultrasonic] Max warnings reached, silent — {distance_cm:.1f} cm")
    
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
            if can_report_danger('gyroscope'):
                # Only speak when reporting (applies cooldown to both speech and logging)
                speak("Alert! Device is shaking violently! Possible fall detected!")
                content = f"Fall detection - Excessive shaking detected (angular velocity: {total_gyro:.1f}°/s)"
                report_danger('FALL_DETECTION', content)
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

            # ── STOP MODE: pause all sensor checks ───────────────────────
            if os.path.exists(STOP_FLAG):
                time.sleep(0.5)
                continue
            
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