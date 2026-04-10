#!/usr/bin/env python3
"""
🛡️ 安全硬件監控系統 (Pi5)
監控超音波感測器和陀螺儀，檢測危險情況並上報到 Supabase
"""

import time
import math
import subprocess
import sys
from gpiozero import DistanceSensor
from mpu6050 import mpu6050
import os

# 導入 Supabase 客戶端
try:
    from supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("⚠️  警告: Supabase 客戶端未找到，將以本地模式運行")

# 強制 Python 即時輸出，唔好扣起啲 print
sys.stdout.reconfigure(line_buffering=True)

# =============== 硬件初始化 ===============
try: 
    ultrasonic = DistanceSensor(echo=24, trigger=23, max_distance=2.0)
    print("✅ [Hardware] 超聲波 Sensor 成功連接！")
except Exception as e: 
    ultrasonic = None
    print(f"❌ [Hardware] 超聲波連接失敗: {e}")

try: 
    gyro = mpu6050(0x68)
    print("✅ [Hardware] 陀螺儀成功連接！")
except Exception as e: 
    gyro = None
    print(f"❌ [Hardware] 陀螺儀連接失敗: {e}")

# =============== 監控參數 ===============
# 超音波感測器
ULTRASONIC_DANGER_DISTANCE = 0.3  # 30cm - 物件太接近
ULTRASONIC_CHECK_INTERVAL = 0.2  # 200ms 檢查一次

# 陀螺儀
GYRO_DANGER_THRESHOLD = 300  # 角速度閾值 (角度/秒) - 過度搖晃
GYRO_CHECK_INTERVAL = 0.2  # 200ms 檢查一次

# 上報限制 (避免洪水式上報)
REPORT_COOLDOWN = 5  # 同一類型危險，5秒內最多上報一次

# =============== 全域狀態 ===============
last_danger_time = {}  # {'ultrasonic': 時間戳, 'gyroscope': 時間戳}
loop_count = 0  # 用嚟計時顯示心跳

def speak(text):
    """發聲警告 (優先使用 TTS 打斷 AI 語音)"""
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
    subprocess.Popen(["espeak", "-v", "en-us", "-s", "160", text], stderr=subprocess.DEVNULL)

def can_report_danger(sensor_type: str) -> bool:
    """
    檢查是否可以報告危險 (避免重複上報)
    
    Args:
        sensor_type: 'ultrasonic' 或 'gyroscope'
    
    Returns:
        True 如果可以報告，False 如果在冷卻期內
    """
    current_time = time.time()
    last_time = last_danger_time.get(sensor_type, 0)
    
    if current_time - last_time >= REPORT_COOLDOWN:
        last_danger_time[sensor_type] = current_time
        return True
    return False

def report_danger(activity_type: str, content: str):
    """
    上報危險事件到 Supabase
    
    Args:
        activity_type: 'ultrasonic' 或 'gyroscope'
        content: 詳細的危險描述
    """
    if not HAS_SUPABASE:
        print(f"⚠️  無法上報 (Supabase 不可用): {activity_type} - {content}")
        return
    
    # 同步上報 (非同步避免阻擋監控迴圈)
    try:
        supabase.log_activity(
            activity_type=activity_type,
            detected_content=content
        )
    except Exception as e:
        print(f"❌ 上報失敗: {e}")

def check_ultrasonic():
    """檢查超音波感測器，檢測物件太接近"""
    if ultrasonic is None:
        return
    
    try:
        distance = ultrasonic.distance  # 距離 (米)
        distance_cm = distance * 100  # 轉換為厘米
        
        if distance < ULTRASONIC_DANGER_DISTANCE:
            # 危險：物件太接近
            speak(f"Warning! Object detected at {distance_cm:.1f} centimeters!")
            
            if can_report_danger('ultrasonic'):
                content = f"在前面發現物件，距離 {distance_cm:.1f} cm"
                report_danger('ultrasonic', content)
                print(f"⚠️  [Danger] 超音波: {content}")
    
    except Exception as e:
        print(f"❌ 超音波讀取失敗: {e}")

def check_gyroscope():
    """檢查陀螺儀，檢測過度搖晃 (可能跌倒)"""
    if gyro is None:
        return
    
    try:
        # 讀取角速度 (单位: 角度/秒)
        gyro_data = gyro.get_gyro_data()
        gyro_x = gyro_data['x']
        gyro_y = gyro_data['y']
        gyro_z = gyro_data['z']
        
        # 計算總的角速度大小
        total_gyro = math.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
        
        if total_gyro > GYRO_DANGER_THRESHOLD:
            # 危險：過度搖晃，可能跌倒或摔傷
            speak("Alert! Device is shaking violently! Possible fall detected!")
            
            if can_report_danger('gyroscope'):
                content = f"跌親 - 檢測到過度搖晃 (角速度: {total_gyro:.1f}°/s)"
                report_danger('gyroscope', content)
                print(f"⚠️  [Danger] 陀螺儀: {content}")
    
    except Exception as e:
        print(f"❌ 陀螺儀讀取失敗: {e}")

def main():
    """主監控迴圈"""
    global loop_count
    
    print("\n" + "="*50)
    print("🛡️  安全硬件監控系統已啟動")
    print("="*50)
    
    try:
        while True:
            loop_count += 1
            
            # 每 10 個迴圈印一次心跳
            if loop_count % 50 == 0:
                print(f"💓 [Heartbeat] 監控運行中... (迴圈 {loop_count})")
            
            # 檢查超音波感測器
            check_ultrasonic()
            time.sleep(ULTRASONIC_CHECK_INTERVAL)
            
            # 檢查陀螺儀
            check_gyroscope()
            time.sleep(GYRO_CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n✋ [System] 硬件監控已停止")
        sys.exit(0)
    except Exception as e:
        print(f"❌ [System] 發生錯誤: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()