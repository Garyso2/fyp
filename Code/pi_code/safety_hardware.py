import time
import math
import subprocess
import sys
from gpiozero import DistanceSensor
from mpu6050 import mpu6050
import os



# 強制 Python 即時輸出，唔好扣起啲 print
sys.stdout.reconfigure(line_buffering=True)

try: 
    ultrasonic = DistanceSensor(echo=24, trigger=23, max_distance=2.0)
    # print("✅ [Hardware] 超聲波 Sensor 成功連接！")
except Exception as e: 
    ultrasonic = None
    # print(f"❌ [Hardware] 超聲波連接失敗: {e}")

try: 
    gyro = mpu6050(0x68)
    print("✅ [Hardware] 陀螺儀成功連接！")
except Exception as e: 
    gyro = None
    # print(f"❌ [Hardware] 陀螺儀連接失敗: {e}")

last_danger_time = 0
ultra_stop_count = 0
ultra_danger_count = 0
loop_count = 0 # 用嚟計時顯示心跳

def speak(text):
    print(f"🔊 硬件緊急發聲: {text}")
    
    # 1. 放低「危險鎖定」檔案，警告 AI 程式依家非常時期，唔准出聲！
    try:
        with open("/tmp/danger.lock", "w") as f:
            f.write(str(time.time()))
    except: pass
    
    # 2. 霸道總裁：直接「殺死」正在播放中嘅 AI 靚聲 (mpg123)
    subprocess.run(["pkill", "-f", "mpg123"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "espeak"], stderr=subprocess.DEVNULL)
    
    # 3. 自己用最快速度發聲 (0秒延遲救命)
    # 加咗 "-v en-us" 轉做美式口音，聽落會順耳少少
    subprocess.Popen(["espeak", "-v", "en-us", "-s", "160", text], stderr=subprocess.DEVNULL)