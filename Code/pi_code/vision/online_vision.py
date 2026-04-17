import requests
import time
import os
import subprocess
import signal
import sys

# Allow imports from pi_code root (config.py, constants.py) when run as a subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gtts import gTTS

os.environ["PYTHONWARNINGS"] = "ignore"
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

from config import SERVER_IP, SERVER_PORT, API_KEY, RUN_DIR, WALK_LOOP_DELAY, SPEECH_COOLDOWN, DANGER_COOLDOWN, DEVICE_ID

# ================= Configuration =================
PORT = SERVER_PORT

URL_STREAM = f"http://{SERVER_IP}:{PORT}/detect_stream"
URL_DETAIL = f"http://{SERVER_IP}:{PORT}/analyze_detail"
URL_HEALTH = f"http://{SERVER_IP}:{PORT}/health"
URL_ASK = f"http://{SERVER_IP}:{PORT}/ask_ai"  # 🌟 AI Q&A dedicated URL

HEADERS = {"x-api-key": API_KEY, "Content-Type": "image/jpeg"}
session = requests.Session()
session.headers.update(HEADERS)

os.makedirs(RUN_DIR, exist_ok=True)
CMD_FILE = os.path.join(RUN_DIR, "voice_cmd.txt")

# System state and cooldown
running = True
tts_enabled = True
last_spoken_message = ""
last_spoken_time = 0
current_tts_process = None
last_danger_time = 0
system_active = True  # False when user says "STOP SYSTEM", True after "START"
STOP_FLAG = "/tmp/system_stopped.flag"

# Clear any stale speaking lock from previous run
try:
    if os.path.exists("/tmp/speaking.lock"):
        os.remove("/tmp/speaking.lock")
except: pass

# ================= Voice Speaking Functionality =================
def speak(text, force=False):
    global last_spoken_message, last_spoken_time, current_tts_process
    if not text: return
    current_time = time.time()
    
    # ==========================================
    # 🚨 Absolute priority mechanism: check if hardware has muted AI
    # ==========================================
    if os.path.exists("/tmp/danger.lock"):
        try:
            with open("/tmp/danger.lock", "r") as f:
                lock_time = float(f.read().strip())
            # If hardware alert within 3.5 seconds, AI must be silent!
            if current_time - lock_time < 3.5:
                print(f"🤫 [AI Muted] Yielding to hardware, canceling speech: {text}")
                return
        except: pass
    # ==========================================

    if not force and text == last_spoken_message and (current_time - last_spoken_time < SPEECH_COOLDOWN): 
        return 

    print(f"🗣️ AI Vision: {text}")
    last_spoken_message = text
    last_spoken_time = current_time

    # Kill any previous speech to prevent overlapping
    subprocess.run(["pkill", "-f", "mpg123"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "espeak"], stderr=subprocess.DEVNULL)

    # 🔇 Create speaking lock so mic won't pick up device's own voice
    try:
        with open("/tmp/speaking.lock", "w") as f: f.write(str(time.time()))
    except: pass

    # 🌟 Use Google TTS (MP3)
    try:
        audio_path = os.path.join(RUN_DIR, "ai_speech.mp3")
        tts = gTTS(text, lang="en")
        tts.save(audio_path)
        current_tts_process = subprocess.Popen(["mpg123", "-q", audio_path])
    except Exception as e:
        # If can't reach internet, fallback to espeak
        current_tts_process = subprocess.Popen(["espeak", "-v", "en-us", "-s", "155", text], stderr=subprocess.DEVNULL)

def wait_for_speech_to_finish(timeout=15):
    global current_tts_process
    if not current_tts_process: return
    start_wait = time.time()
    while current_tts_process.poll() is None:
        time.sleep(0.1)
        if time.time() - start_wait > timeout: break
    # 🔇 Remove speaking lock so mic resumes listening
    try:
        if os.path.exists("/tmp/speaking.lock"): os.remove("/tmp/speaking.lock")
    except: pass

# ================= Camera and Network Helpers =================
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

# ================= Receive Commands from Voice Listener =================
def get_battery_level():
    """Read battery level from system power supply."""
    for path in ['/sys/class/power_supply/battery/capacity',
                 '/sys/class/power_supply/BAT0/capacity']:
        try:
            with open(path, 'r') as f:
                return max(0, min(100, int(f.read().strip())))
        except Exception:
            pass
    return 85  # Default mock value when no UPS attached

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
    print("\n🛑 [Online Vision] Stopping...")
    running = False
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ================= Main Program (Pure Network Analysis Logic) =================
def main():    
    global last_danger_time, last_spoken_message, system_active
    state = "WALKING"
    last_color = "None"
    was_in_danger = False 
    wait_mode_start_time = 0 
    resume_walking_time = 0
    walk_gesture_count = 0  
    last_nearest_obj = ""   
    chat_mode_active = False  # Suppresses walking line when AI chat is active
    
    print(f"🚀 [Online Vision] Started | Server: {SERVER_IP}")
    if not check_server():
        print("❌ [Online Vision] Server unreachable. Exiting.")
        return

    speak("Online navigation ready.", force=True)

    while running:
        # ── Always check for STOP / START / BATTERY regardless of state ──
        voice_cmd = get_voice_command()

        if voice_cmd == "SYSTEM_STOP":
            system_active = False
            speak("System stopped. Say start to resume.", force=True)
            wait_for_speech_to_finish()
            print("🛑 [Online Vision] System paused.")

        elif voice_cmd == "SYSTEM_START":
            system_active = True
            speak("System started.", force=True)
            wait_for_speech_to_finish()
            print("▶️  [Online Vision] System resumed.")

        elif voice_cmd == "BATTERY_STATUS":
            level = get_battery_level()
            speak(f"Battery is at {level} percent.", force=True)
            wait_for_speech_to_finish()

        # ── When stopped, skip all sensor/vision logic ────────────────────
        if not system_active:
            time.sleep(0.5)
            continue

        if state == "WALKING":
            # 1. Check for voice commands (already consumed above; re-read if nothing came in)
            if voice_cmd is None:
                voice_cmd = get_voice_command()
            
            # 🌟 Added: Handle AI Q&A commands
            if voice_cmd and voice_cmd.startswith("ASK_AI:"):
                question = voice_cmd.split("ASK_AI:", 1)[1].strip()
                # Ignore very short/empty strings — likely mic echo (e.g. "hi", "bye")
                if len(question.split()) < 2:
                    resume_walking_time = time.time()
                    continue
                print()
                print(f"❓ [Q&A] {question}")
                
                img_bytes = capture_jpeg_memory(1920, 1080, 85)
                if img_bytes:
                    speak("Let me look.", force=True)
                    try:
                        resp = session.post(URL_ASK, data=img_bytes, params={"question": question}, timeout=20)
                        if resp.status_code == 200:
                            answer = resp.json().get("answer", "Sorry, I couldn't get an answer.")
                            speak(answer, force=True)
                            wait_for_speech_to_finish()
                        else:
                            print(f"❌ [Online Vision - Q&A Mode] Server error")
                            speak("Server error, please try again.", force=True)
                            wait_for_speech_to_finish()
                    except Exception as e:
                        print(f"❌ [Online Vision - Q&A Mode] Network error: {e}")
                        speak("Cannot reach server, please try again.", force=True)
                        wait_for_speech_to_finish()
                else:
                    speak("Camera error.", force=True)
                    wait_for_speech_to_finish()
                
                resume_walking_time = time.time()
                continue

            # Chat Room Open - greet the user
            if voice_cmd == "CHAT_ROOM_OPEN":
                chat_mode_active = True
                print()
                print("─" * 45)
                print("[Chat Mode] Activated — Walking output paused")
                speak("Hi.", force=True)
                wait_for_speech_to_finish()
                resume_walking_time = time.time()
                continue

            # Chat Room Exit - gracefully exit and resume walking
            if voice_cmd == "CHAT_ROOM_EXIT":
                chat_mode_active = False
                speak("Bye.", force=True)
                wait_for_speech_to_finish()
                print("[Chat Mode] Exited — resuming Walking Mode")
                print("─" * 45)
                resume_walking_time = time.time()
                continue

            # Photo command (single execution)
            if voice_cmd == "PHOTO_ONCE":
                print(f"📷 [Online Vision - Switching to Analysis Mode]")
                speak("Analysis mode.", force=True)
                state = "FINDING_PREP"
                walk_gesture_count = 0
                time.sleep(1)
                continue
            
            start_time = time.time()
            
            # 2. Capture image
            img_bytes = capture_jpeg_memory(1280, 720, 55)
            if not img_bytes: time.sleep(0.1); continue
            
            # 3. Communicate with Server
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
                
                if not chat_mode_active:
                    ts = time.strftime("%H:%M:%S")
                    print(f"\r[Walking Mode] {ts} | {obstacle} | {color}", end="", flush=True)

                # Handle gesture
                if switch or gesture == "Open_Palm":
                    if time.time() - resume_walking_time > 5.0:
                        walk_gesture_count += 1
                        if walk_gesture_count >= 3:
                            print(f"🖐️  [Online Vision - Gesture Detected] Switching to Analysis Mode")
                            speak("Analysis mode.", force=True); state = "FINDING_PREP"; walk_gesture_count = 0; time.sleep(1); continue
                else: walk_gesture_count = 0 

                # Handle traffic light color
                if color == "Red" and last_color != "Red": speak("Red Light.", force=True); last_color = "Red"
                elif color == "Green" and last_color != "Green": speak("Green Light.", force=True); last_color = "Green"
                elif color == "None": last_color = "None"

                # Handle YOLO visual obstacle avoidance
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
                print(f"⚠️ [Online Vision] Network Error: {e}")
                time.sleep(0.5)

            sleep_time = WALK_LOOP_DELAY - (time.time() - start_time)
            if sleep_time > 0:
                time.sleep(sleep_time)

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
                        speak(desc, force=True)
                        wait_for_speech_to_finish()
                    else:
                        speak("Server error.", force=True)
                        wait_for_speech_to_finish()
                except Exception:
                    speak("Network error.", force=True)
                    wait_for_speech_to_finish()
            else:
                speak("Camera error.", force=True)
                wait_for_speech_to_finish()
            
            speak("Say photo to take again, or say exit to resume walking.", force=True)
            state = "WAIT_FOR_EXIT"
            wait_mode_start_time = time.time()
            gesture_hold_count = 0
            last_seen_gesture = "None"
            time.sleep(3) 

        elif state == "WAIT_FOR_EXIT":
            voice_cmd = get_voice_command()
            if voice_cmd == "PHOTO_ONCE":
                speak("One more time.", force=True)
                state = "FINDING_PREP"
                time.sleep(2)
                continue
            elif voice_cmd == "EXIT_PHOTO":
                speak("Walking mode.", force=True)
                state = "WALKING"
                resume_walking_time = time.time()
                time.sleep(2)
                continue

            img_bytes = capture_jpeg_memory(416, 320, 50)
            if not img_bytes:
                continue

            try:
                resp = session.post(URL_STREAM, data=img_bytes, timeout=6)
                if resp.status_code == 200:
                    gesture = resp.json().get("gesture", "None")
                    if gesture in ["Open_Palm", "Victory"]:
                        if gesture == last_seen_gesture:
                            gesture_hold_count += 1
                        else:
                            gesture_hold_count = 1
                            last_seen_gesture = gesture
                    else:
                        gesture_hold_count = 0
                        last_seen_gesture = "None"

                    if gesture_hold_count >= 3:
                        if gesture == "Open_Palm" and (time.time() - wait_mode_start_time > 2.0):
                            speak("Walking mode.", force=True)
                            state = "WALKING"
                            resume_walking_time = time.time()
                            gesture_hold_count = 0
                            time.sleep(2)
                        elif gesture == "Victory" and (time.time() - wait_mode_start_time > 2.0):
                            speak("One more time.", force=True)
                            state = "FINDING_PREP"
                            gesture_hold_count = 0
                            time.sleep(2)
            except Exception:
                pass
            time.sleep(0.3)

if __name__ == "__main__":
    main()