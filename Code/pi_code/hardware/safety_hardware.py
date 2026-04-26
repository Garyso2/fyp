#!/usr/bin/env python3
"""
🛡️ Safety Hardware Monitor
HC-SR04 Ultrasonic Sensor  — warns when obstacle is 0.2 – 2.0 m away
GY-521 Gyroscope (MPU-6050) — detects violent shaking / fall
Both events are reported to Supabase after confirmation.
"""

import os
import sys
import time
import math
import threading
import subprocess
import warnings

# ── Allow imports from pi_code root when run directly ──────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Pi 5: force lgpio backend for gpiozero ─────────────────────────────────
os.environ.setdefault("GPIOZERO_PIN_FACTORY", "lgpio")

# ── Suppress gpiozero "no echo" spam — we handle it ourselves ──────────────
from gpiozero import DistanceSensor
from gpiozero.exc import DistanceSensorNoEcho
warnings.filterwarnings("ignore", category=DistanceSensorNoEcho)

from mpu6050 import mpu6050
from config import (
    DEVICE_ID,
    ULTRASONIC_CHECK_INTERVAL,
    GYRO_CHECK_INTERVAL,
    GYRO_DANGER_THRESHOLD,
    ACTIVITY_LOG_COOLDOWN,
)

# ── Supabase (optional — falls back to local-only mode) ────────────────────
try:
    from services.supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("⚠️  Supabase client not found — running in local mode")

# ── Unbuffered output (important when run as subprocess) ───────────────────
sys.stdout.reconfigure(line_buffering=True)

# ===========================================================================
# Configuration
# ===========================================================================
ULTRASONIC_TRIG_PIN  = 23       # GPIO pin connected to HC-SR04 TRIG
ULTRASONIC_ECHO_PIN  = 24       # GPIO pin connected to HC-SR04 ECHO
ULTRASONIC_MIN_M     = 0.2      # metres — closer than this: ignore (noise / touching)
ULTRASONIC_MAX_M     = 2.0      # metres — farther than this: no warning
ULTRASONIC_MAX_SENSE = 4.0      # metres — DistanceSensor hardware limit
BEEPS_BEFORE_REPORT  = 3        # consecutive beeps before speaking + DB log

STOP_FLAG        = "/tmp/system_stopped.flag"
OBSTACLE_TRIGGER = "/tmp/obstacle_scan.trigger"
DANGER_LOCK      = "/tmp/danger.lock"

# ===========================================================================
# Hardware Initialisation
# ===========================================================================
try:
    ultrasonic = DistanceSensor(
        echo=ULTRASONIC_ECHO_PIN,
        trigger=ULTRASONIC_TRIG_PIN,
        max_distance=ULTRASONIC_MAX_SENSE,
    )
    print(f"✅ [Hardware] HC-SR04 connected  (TRIG=GPIO{ULTRASONIC_TRIG_PIN}, ECHO=GPIO{ULTRASONIC_ECHO_PIN})")
except Exception as e:
    ultrasonic = None
    print(f"❌ [Hardware] HC-SR04 init failed: {e}")

try:
    gyro = mpu6050(0x68)
    _ = gyro.get_gyro_data()        # quick read to confirm I2C comms
    print("✅ [Hardware] GY-521 (MPU-6050) connected  (I2C 0x68)")
except Exception as e:
    gyro = None
    print(f"❌ [Hardware] GY-521 init failed: {e}")

# ===========================================================================
# State
# ===========================================================================
_ultrasonic_read_count = 0
_ultrasonic_beep_count = 0
_ultrasonic_reported   = False
_ultrasonic_in_range   = False

_gyro_read_count       = 0
_gyro_last_report_time = 0.0

_beep_proc  = None
_speak_proc = None

# ===========================================================================
# Audio helpers
# ===========================================================================

def _beep():
    """Single short 1 kHz tone (non-blocking)."""
    global _beep_proc
    if _beep_proc and _beep_proc.poll() is None:
        try:
            _beep_proc.terminate()
            _beep_proc.wait(timeout=0.3)
        except Exception:
            pass
    try:
        _beep_proc = subprocess.Popen(
            ["speaker-test", "-t", "sine", "-f", "1000", "-l", "1"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        proc = _beep_proc
        def _stop():
            time.sleep(0.25)
            if proc.poll() is None:
                try: proc.terminate()
                except Exception: pass
        threading.Thread(target=_stop, daemon=True).start()
    except Exception:
        try:
            _beep_proc = subprocess.Popen(
                ["beep", "-f", "1000", "-l", "250"],
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass  # silent fail — beep is best-effort


def _speak(text: str):
    """
    High-priority espeak alert.
    Writes /tmp/danger.lock so the AI vision module stays silent.
    """
    global _speak_proc
    print(f"🔊 [Alert] {text}", flush=True)

    try:
        with open(DANGER_LOCK, "w") as f:
            f.write(str(time.time()))
    except Exception:
        pass

    if _speak_proc and _speak_proc.poll() is None:
        try:
            _speak_proc.terminate()
            _speak_proc.wait(timeout=0.3)
        except Exception:
            pass

    _speak_proc = subprocess.Popen(
        ["espeak", "-v", "en-us", "-s", "160", text],
        stderr=subprocess.DEVNULL,
    )

# ===========================================================================
# Database reporting
# ===========================================================================

def _report(activity_type: str, content: str):
    if not HAS_SUPABASE:
        print(f"⚠️  [DB] Supabase unavailable — skipping: {activity_type} | {content}")
        return
    try:
        supabase.log_activity(activity_type=activity_type, detected_content=content)
        print(f"✅ [DB] Logged → {activity_type}: {content}", flush=True)
    except Exception as e:
        print(f"❌ [DB] Log failed: {e}", flush=True)

# ===========================================================================
# Sensor checks
# ===========================================================================

def check_ultrasonic():
    """
    Read HC-SR04 distance.
    - Print live reading once per second (every 5 checks × 0.2 s interval).
    - While object is inside 0.2 – 2.0 m: beep every check.
    - After BEEPS_BEFORE_REPORT beeps: speak warning + log DB + send vision trigger.
    - Reset state once object leaves range.
    """
    global _ultrasonic_read_count, _ultrasonic_beep_count
    global _ultrasonic_reported, _ultrasonic_in_range

    if ultrasonic is None:
        return

    try:
        distance = ultrasonic.distance          # metres; None if no echo
        _ultrasonic_read_count += 1

        # ── No echo received ───────────────────────────────────────────────
        if distance is None:
            if _ultrasonic_read_count % 5 == 0:
                print(
                    f"📡 [Ultrasonic]  --- cm  |  ⚠️  No echo "
                    f"(TRIG=GPIO{ULTRASONIC_TRIG_PIN}, ECHO=GPIO{ULTRASONIC_ECHO_PIN})",
                    flush=True,
                )
            return

        distance_cm = distance * 100
        in_range = ULTRASONIC_MIN_M <= distance <= ULTRASONIC_MAX_M

        # ── Live display once per second ───────────────────────────────────
        if _ultrasonic_read_count % 5 == 0:
            tag = (
                f"⚠️  OBSTACLE  (beep {_ultrasonic_beep_count}/{BEEPS_BEFORE_REPORT})"
                if in_range else "✅ Clear"
            )
            print(f"📡 [Ultrasonic] {distance_cm:6.1f} cm  |  {tag}", flush=True)

        # ── Object inside warning zone ─────────────────────────────────────
        if in_range:
            _ultrasonic_in_range = True

            if not _ultrasonic_reported:
                _ultrasonic_beep_count += 1
                _beep()
                print(
                    f"⚠️  [Ultrasonic] Beep {_ultrasonic_beep_count}/{BEEPS_BEFORE_REPORT}"
                    f"  —  {distance_cm:.1f} cm",
                    flush=True,
                )

                if _ultrasonic_beep_count >= BEEPS_BEFORE_REPORT:
                    _ultrasonic_reported = True
                    _speak(f"Warning! Obstacle at {distance_cm:.0f} centimetres!")
                    _report(
                        "OBSTACLE_WARNING",
                        f"Obstacle detected at {distance_cm:.1f} cm",
                    )
                    try:
                        with open(OBSTACLE_TRIGGER, "w") as f:
                            f.write(str(time.time()))
                        print("📡 [Ultrasonic] Vision scan trigger sent.", flush=True)
                    except Exception:
                        pass

        # ── Object cleared ─────────────────────────────────────────────────
        else:
            if _ultrasonic_in_range:
                print(f"✅ [Ultrasonic] Object cleared ({distance_cm:.1f} cm) — resetting.", flush=True)
            _ultrasonic_in_range   = False
            _ultrasonic_beep_count = 0
            _ultrasonic_reported   = False

    except Exception as e:
        print(f"❌ [Ultrasonic] Read error: {e}", flush=True)


def check_gyroscope():
    """
    Read GY-521 angular velocity.
    - Print live reading once per second.
    - If total angular velocity > GYRO_DANGER_THRESHOLD: speak + log DB.
    - Cooldown of ACTIVITY_LOG_COOLDOWN seconds between reports.
    """
    global _gyro_read_count, _gyro_last_report_time

    if gyro is None:
        return

    try:
        data  = gyro.get_gyro_data()
        gx, gy, gz = data["x"], data["y"], data["z"]
        total = math.sqrt(gx**2 + gy**2 + gz**2)
        _gyro_read_count += 1

        # ── Live display once per second ───────────────────────────────────
        if _gyro_read_count % 5 == 0:
            tag = (
                f"🚨 FALL DETECTED  ({total:.1f}°/s)"
                if total > GYRO_DANGER_THRESHOLD
                else f"✅ Stable  ({total:.1f}°/s)"
            )
            print(
                f"🔄 [Gyroscope]  x={gx:8.1f}  y={gy:8.1f}  z={gz:8.1f}  |  {tag}",
                flush=True,
            )

        # ── Fall / violent shake ───────────────────────────────────────────
        if total > GYRO_DANGER_THRESHOLD:
            now = time.time()
            if now - _gyro_last_report_time >= ACTIVITY_LOG_COOLDOWN:
                _gyro_last_report_time = now
                _speak("Alert! Possible fall detected!")
                _report(
                    "FALL_DETECTION",
                    f"Fall detected — angular velocity {total:.1f}°/s "
                    f"(x={gx:.1f}, y={gy:.1f}, z={gz:.1f})",
                )

    except Exception as e:
        print(f"❌ [Gyroscope] Read error: {e}", flush=True)

# ===========================================================================
# Main loop
# ===========================================================================

def main():
    print("\n" + "=" * 54)
    print("🛡️  Safety Hardware Monitor — starting")
    print(f"   HC-SR04 :  {ULTRASONIC_MIN_M*100:.0f} – {ULTRASONIC_MAX_M*100:.0f} cm warning zone,  {BEEPS_BEFORE_REPORT} beeps before alert")
    print(f"   GY-521  :  fall threshold {GYRO_DANGER_THRESHOLD} °/s")
    print("=" * 54 + "\n")

    # Clear stale stop flag from previous run
    if os.path.exists(STOP_FLAG):
        os.remove(STOP_FLAG)
        print("🧹 [Startup] Stale STOP flag cleared.\n")

    loop = 0
    try:
        while True:
            loop += 1

            # Heartbeat every ~10 seconds (25 loops × ~0.4 s per loop)
            if loop % 25 == 0:
                u_status = "🟢 OK" if ultrasonic is not None else "🔴 NOT CONNECTED"
                g_status = "🟢 OK" if gyro       is not None else "🔴 NOT CONNECTED"
                print(f"💓 [Heartbeat] loop={loop}  HC-SR04={u_status}  GY-521={g_status}", flush=True)

            # Paused via voice command
            if os.path.exists(STOP_FLAG):
                if loop % 25 == 0:
                    print("⏸️  [Safety Hardware] PAUSED (STOP flag active)", flush=True)
                time.sleep(0.5)
                continue

            check_ultrasonic()
            time.sleep(ULTRASONIC_CHECK_INTERVAL)

            check_gyroscope()
            time.sleep(GYRO_CHECK_INTERVAL)

    except KeyboardInterrupt:
        print("\n✋ [Safety Hardware] Stopped.")
        sys.exit(0)
    except Exception as e:
        print(f"❌ [Safety Hardware] Fatal error: {e}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
