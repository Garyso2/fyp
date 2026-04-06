import time
import subprocess
import math
import queue
import threading
import json as _json
import os

# 引入硬件庫
from gpiozero import DistanceSensor
from mpu6050 import mpu6050

# ================= 設定區 =================
tts_enabled = True
last_spoken_message = ""
last_spoken_time = 0
current_tts_process = None
SPEECH_COOLDOWN = 4.0 

# 硬件狀態變數
voice_command_queue = queue.Queue()
VOICE_COOLDOWN = 3.0
ultra_stop_count = 0
ultra_danger_count = 0
last_danger_time = 0

# ================= 初始化 =================
print("🔌 Initializing Local Hardware...")
try:
    ultrasonic = DistanceSensor(echo=24, trigger=23, max_distance=2.0)
    print("✅ Ultrasonic: OK")
except Exception as e:
    ultrasonic = None
    print(f"❌ Ultrasonic: Failed ({e})")

try:
    gyro = mpu6050(0x68)
    print("✅ Gyro: OK")
except Exception as e:
    gyro = None
    print(f"❌ Gyro: Failed ({e})")

# ================= 輔助功能 (語音) =================
def speak(text, force=False):
    global last_spoken_message, last_spoken_time, current_tts_process
    if not text: return
    current_time = time.time()
    
    if not force:
        if text == last_spoken_message and (current_time - last_spoken_time < SPEECH_COOLDOWN):
            return 

    print(f"🗣️ Speaking: {text}")
    last_spoken_message = text
    last_spoken_time = current_time

    if not tts_enabled: return
    
    if "Stop" in text or "Danger" in text or "Red" in text or "Fall" in text:
        if current_tts_process and current_tts_process.poll() is None:
            try: current_tts_process.kill()
            except Exception: pass
    
    try:
        current_tts_process = subprocess.Popen(
            ["espeak", "-s", "155", text], stderr=subprocess.DEVNULL
        )
    except Exception: pass

def wait_for_speech_to_finish(timeout=15):
    global current_tts_process
    if not current_tts_process: return
    start_wait = time.time()
    while current_tts_process.poll() is None:
        time.sleep(0.1)
        if time.time() - start_wait > timeout: break

# ================= 核心邏輯 =================
def check_offline_safety():
    """ 檢查感測器，回傳狀態給主程式 (原汁原味保留你的邏輯) """
    global ultra_stop_count, ultra_danger_count, last_danger_time
    
    # 1. 跌倒偵測
    if gyro:
        try:
            accel = gyro.get_accel_data()
            tg = math.sqrt(accel['x']**2 + accel['y']**2 + accel['z']**2)
            if tg > 15.0:
                speak("Fall detected!", force=True)
                time.sleep(5)
                return "FALL"
        except Exception: pass

    # 2. 超聲波避障
    if ultrasonic:
        try:
            dist_cm = ultrasonic.distance * 100
            
            # 極度危險 (<50cm)
            if dist_cm < 50.0:
                ultra_stop_count += 1
                if ultra_stop_count >= 2:
                    if time.time() - last_danger_time > 10.0: # DANGER_COOLDOWN
                        speak(f"Stop! obstacle {int(dist_cm)} centimeters ahead.", force=True)
                        last_danger_time = time.time()
                    return "STOP"
            else:
                ultra_stop_count = 0
                
            # 警告距離 (50-100cm)
            if dist_cm < 100.0:
                ultra_danger_count += 1
                if ultra_danger_count >= 2:
                    if time.time() - last_danger_time > 10.0:
                        speak("Danger: object ahead.", force=True)
                        last_danger_time = time.time()
                    return "DANGER"
            else:
                ultra_danger_count = 0
                
        except Exception: pass

    return "SAFE"

def get_voice_command():
    try:
        return voice_command_queue.get_nowait()
    except queue.Empty:
        return None

# (呢度可以保留返你原本個 start_voice_listener() function，因為太長我省略咗顯示，你 copy 原本嗰段落嚟就得)
def start_voice_listener():
    # ... 原本的 Vosk 代碼 ...
    pass