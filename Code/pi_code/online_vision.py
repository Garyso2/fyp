import requests
import time
import os
import subprocess
import signal
import sys
from gtts import gTTS  # 🌟 引入 Google 靚聲庫

# ================= 抑制系統音效警告 =================
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

# ================= 設定區 =================
SERVER_IP = os.getenv("SERVER_IP", "100.125.29.38")
PORT = os.getenv("SERVER_PORT", "8000")
API_KEY = os.getenv("API_KEY", "yoloProject2026")

URL_STREAM = f"http://{SERVER_IP}:{PORT}/detect_stream"
URL_DETAIL = f"http://{SERVER_IP}:{PORT}/analyze_detail"
URL_HEALTH = f"http://{SERVER_IP}:{PORT}/health"
URL_ASK = f"http://{SERVER_IP}:{PORT}/ask_ai"  # 🌟 Hi AI 問答專用網址

HEADERS = {"x-api-key": API_KEY, "Content-Type": "image/jpeg"}
session = requests.Session()
session.headers.update(HEADERS)

WALK_LOOP_DELAY = 0.8

# --- 設定 run 資料夾 (與語音監聽器溝通) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.join(BASE_DIR, "run")
os.makedirs(RUN_DIR, exist_ok=True)
CMD_FILE = os.path.join(RUN_DIR, "voice_cmd.txt")

# 系統狀態與冷卻
running = True
tts_enabled = True
last_spoken_message = ""
last_spoken_time = 0
current_tts_process = None
SPEECH_COOLDOWN = 4.0 
DANGER_COOLDOWN = 10.0
last_danger_time = 0

# ================= 語音發聲功能 =================
def speak(text, force=False):
    global last_spoken_message, last_spoken_time, current_tts_process
    if not text: return
    current_time = time.time()
    
    # ==========================================
    # 🚨 絕對優先權機制：檢查有冇被硬件「封口」
    # ==========================================
    if os.path.exists("/tmp/danger.lock"):
        try:
            with open("/tmp/danger.lock", "r") as f:
                lock_time = float(f.read().strip())
            # 如果 3.5 秒內硬件報過警，AI 必須立刻收聲，讓路畀 Danger！
            if current_time - lock_time < 3.5:
                print(f"🤫 [AI 靜音] 讓路畀硬件，放棄講: {text}")
                return
        except: pass
    # ==========================================

    if not force and text == last_spoken_message and (current_time - last_spoken_time < SPEECH_COOLDOWN): 
        return 

    print(f"🗣️ AI Vision: {text}")
    last_spoken_message = text
    last_spoken_time = current_time

    # 發聲前先清走之前自己講緊嘅嘢，防止自己同自己疊聲
    subprocess.run(["pkill", "-f", "mpg123"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "espeak"], stderr=subprocess.DEVNULL)

    # 🌟 轉用 Google 靚聲 (MP3)
    try:
        audio_path = os.path.join(RUN_DIR, "ai_speech.mp3")
        tts = gTTS(text, lang="en")
        tts.save(audio_path)
        current_tts_process = subprocess.Popen(["mpg123", "-q", audio_path])
    except Exception as e:
        # 萬一上唔到網用唔到 gTTS，自動跌返落去普通聲保底
        current_tts_process = subprocess.Popen(["espeak", "-v", "en-us", "-s", "155", text], stderr=subprocess.DEVNULL)

def wait_for_speech_to_finish(timeout=15):
    global current_tts_process
    if not current_tts_process: return
    start_wait = time.time()
    while current_tts_process.poll() is None:
        time.sleep(0.1)
        if time.time() - start_wait > timeout: break

# ================= 相機與網絡輔助 =================
def capture_jpeg_memory(width, height, quality=25):
    cmd = ["rpicam-still", "-o", "-", "-t", "1", "--width", str(width), "--height", str(height), 
           "--quality", str(quality), "--nopreview", "--zsl", "--autofocus-mode", "continuous"]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=4)
        if result.returncode == 0 and result.stdout: return result.stdout
    except: pass
    return None

def check_server(max_retries=5, interval=2):
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(URL_HEALTH, timeout=3)
            if resp.status_code == 200: return True
        except: pass
        print(f"⏳ Waiting for Server {SERVER_IP}... ({attempt}/{max_retries})")
        time.sleep(interval)
    return False

# ================= 接收獨立語音程式的指令 =================
def get_voice_command():
    try:
        if os.path.exists(CMD_FILE):
            with open(CMD_FILE, "r") as f: cmd = f.read().strip()
            os.remove(CMD_FILE)
            if cmd: print(f"📥 Vision Received Command: {cmd}")
            return cmd
    except: pass
    return None

def signal_handler(sig, frame):
    global running
    print("\n🛑 Stopping Online Vision...")
    running = False
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ================= 主程式 (純網絡分析邏輯) =================
def main():    
    global last_danger_time, last_spoken_message
    state = "WALKING"
    last_color = "None"
    was_in_danger = False 
    wait_mode_start_time = 0 
    resume_walking_time = 0
    walk_gesture_count = 0  
    last_nearest_obj = ""   
    
    print(f"🚀 Online Vision Started | Server: {SERVER_IP}")
    if not check_server():
        print("❌ Server unreachable. Exiting Online Vision.")
        return

    speak("Online navigation ready.", force=True)

    while running:
        if state == "WALKING":
            # 1. 檢查有無聲控指令
            voice_cmd = get_voice_command()
            
            # 🌟 新增：處理 Hi AI 提問指令
            if voice_cmd and voice_cmd.startswith("ASK_AI:"):
                question = voice_cmd.split("ASK_AI:", 1)[1].strip()
                if not question: question = "Describe what you see."
                
                speak("Let me look.", force=True)
                
                img_bytes = capture_jpeg_memory(1920, 1080, 85) 
                if img_bytes:
                    try:
                        resp = session.post(URL_ASK, data=img_bytes, params={"question": question}, timeout=20)
                        if resp.status_code == 200:
                            answer = resp.json().get("answer", "Sorry, I couldn't get an answer.")
                            speak(answer, force=True)
                            wait_for_speech_to_finish()
                        else:
                            speak("Server processing error.", force=True)
                            wait_for_speech_to_finish()
                    except:
                        speak("Network error while asking AI.", force=True)
                        wait_for_speech_to_finish()
                else:
                    speak("Camera error.", force=True)
                    wait_for_speech_to_finish()
                
                resume_walking_time = time.time()
                continue

            # 原有嘅 PHOTO 指令
            if voice_cmd == "PHOTO":
                speak("Analysis mode.", force=True)
                state = "FINDING_PREP"
                walk_gesture_count = 0
                time.sleep(1)
                continue
            
            start_time = time.time()
            
            # 2. 影相
            img_bytes = capture_jpeg_memory(1280, 720, 55)
            if not img_bytes: time.sleep(0.1); continue
            
            # 3. 專心與 Server 溝通
            try:
                resp = session.post(URL_STREAM, data=img_bytes, timeout=6)
                if resp.status_code != 200: time.sleep(0.1); continue
                
                data = resp.json()
                gesture = data.get("gesture", "None")
                obstacle = data.get("obstacle", "Safe")
                switch = data.get("switch_mode", False)
                color = data.get("color", "None")
                nearest_obj = data.get("nearest_object", "")
                if nearest_obj: last_nearest_obj = nearest_obj
                
                print(f"🚶 [YOLO] Obs: {obstacle} | Col: {color} | Ges: {gesture} | Near: {nearest_obj}")

                # 處理手勢
                if switch or gesture == "Open_Palm":
                    if time.time() - resume_walking_time > 5.0:
                        walk_gesture_count += 1
                        if walk_gesture_count >= 3:
                            speak("Analysis mode.", force=True); state = "FINDING_PREP"; walk_gesture_count = 0; time.sleep(1); continue
                else: walk_gesture_count = 0 

                # 處理紅綠燈
                if color == "Red" and last_color != "Red": speak("Red Light.", force=True); last_color = "Red"
                elif color == "Green" and last_color != "Green": speak("Green Light.", force=True); last_color = "Green"
                elif color == "None": last_color = "None"

                # 處理 YOLO 視覺避障
                if obstacle != "Safe":
                    now = time.time()
                    if now - last_danger_time > DANGER_COOLDOWN:
                        if nearest_obj and nearest_obj not in obstacle: speak(f"{obstacle}, {nearest_obj} ahead.", force=True)
                        else: speak(obstacle, force=True)
                        last_danger_time = now
                    was_in_danger = True
                else:
                    if was_in_danger:
                        now = time.time()
                        if now - last_danger_time > DANGER_COOLDOWN: speak("Path Clear."); last_danger_time = now
                        was_in_danger = False

            except Exception as e:
                print(f"⚠️ Net Error: {e}")
                time.sleep(0.5)

            sleep_time = WALK_LOOP_DELAY - (time.time() - start_time)
            if sleep_time > 0: time.sleep(sleep_time)

        elif state == "FINDING_PREP":
            speak("Hold still.", force=True)
            time.sleep(1.5)
            state = "FINDING_SNAP"

        elif state == "FINDING_SNAP":
            speak("Capturing...", force=True)
            img_bytes = capture_jpeg_memory(1920, 1080, 90)
            if img_bytes:
                try:
                    resp = session.post(URL_DETAIL, data=img_bytes, timeout=20)
                    if resp.status_code == 200:
                        desc = resp.json().get("description", "No result")
                        speak(desc, force=True); wait_for_speech_to_finish() 
                    else: speak("Server error.", force=True); wait_for_speech_to_finish()
                except: speak("Network error.", force=True); wait_for_speech_to_finish()
            else: speak("Camera error.", force=True); wait_for_speech_to_finish()
            
            speak("Say photo to take again, or say exit to resume walking.", force=True)
            state = "WAIT_FOR_EXIT"
            wait_mode_start_time = time.time()
            gesture_hold_count = 0
            last_seen_gesture = "None"
            time.sleep(3) 

        elif state == "WAIT_FOR_EXIT":
            voice_cmd = get_voice_command()
            if voice_cmd == "PHOTO":
                speak("One more time.", force=True); state = "FINDING_PREP"; time.sleep(2); continue
            elif voice_cmd == "EXIT_PHOTO":
                speak("Walking mode.", force=True); state = "WALKING"; resume_walking_time = time.time(); time.sleep(2); continue

            img_bytes = capture_jpeg_memory(416, 320, 50)
            if not img_bytes: continue

            try:
                resp = session.post(URL_STREAM, data=img_bytes, timeout=6)
                if resp.status_code == 200:
                    gesture = resp.json().get("gesture", "None")
                    if gesture in ["Open_Palm", "Victory"]:
                        if gesture == last_seen_gesture: gesture_hold_count += 1
                        else: gesture_hold_count = 1; last_seen_gesture = gesture
                    else: gesture_hold_count = 0; last_seen_gesture = "None"

                    if gesture_hold_count >= 3:
                        if gesture == "Open_Palm" and (time.time() - wait_mode_start_time > 2.0):
                            speak("Walking mode.", force=True); state = "WALKING"; resume_walking_time = time.time(); gesture_hold_count = 0; time.sleep(2) 
                        elif gesture == "Victory" and (time.time() - wait_mode_start_time > 2.0):
                            speak("One more time.", force=True); state = "FINDING_PREP"; gesture_hold_count = 0; time.sleep(2)
            except: pass
            time.sleep(0.3)

if __name__ == "__main__":
    main()