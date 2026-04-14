import vosk
import pyaudio
import json as _json
import os
import time

# --- Import configuration ---
from config import RUN_DIR, DEVICE_ID

# --- Set command file ---
CMD_FILE = os.path.join(RUN_DIR, "voice_cmd.txt")

print("🎤 [Voice Listener] Loading Vosk models...")
model_path = os.path.expanduser("~/vosk-model-small-en-us-0.15")
if not os.path.exists(model_path):
    print(f"❌ Vosk model not found at {model_path}!")
    exit(1)

model = vosk.Model(model_path)
p = pyaudio.PyAudio()

try:
    device_info = p.get_default_input_device_info()
    mic_rate = int(device_info.get('defaultSampleRate', 16000))
except Exception:
    mic_rate = 16000

rec = vosk.KaldiRecognizer(model, mic_rate)

try:
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=mic_rate, input=True, frames_per_buffer=4000)
    stream.start_stream()
except Exception as e:
    print(f"❌ Cannot open microphone (Error: {e})")
    exit(1)

print("🎤 [Voice Listener] Listening for commands...")
ask_mode = False  # 🌟 Added: question mode

while True:
    try:
        data = stream.read(4000, exception_on_overflow=False)
        if rec.AcceptWaveform(data):
            res = _json.loads(rec.Result())
            text = res.get("text", "").lower().strip()
            
            if not text: continue
            
            # Fix common speech recognition errors
            text = text.replace("a i", "ai").replace("hey i", "hey ai")
            print(f"👂 Recognized: {text}")

            # 🌟 Added logic: Hi AI Q&A
            if "hi ai" in text or "hey ai" in text:
                # Try to extract the question after "hi ai"
                keyword = "hi ai" if "hi ai" in text else "hey ai"
                question = text.split(keyword)[-1].strip()
                
                if question:
                    # If question is included in same sentence (e.g., "hi ai what is this")
                    with open(CMD_FILE, "w") as f: f.write(f"ASK_AI:{question}")
                    print(f"🎤 Triggered AI Question: {question}")
                    ask_mode = False
                else:
                    # If only "hi ai" is said, wait for next sentence as question
                    ask_mode = True
                    print("🎤 AI is waiting for your question...")
                    
            elif ask_mode:
                # Next sentence is treated as question
                with open(CMD_FILE, "w") as f: f.write(f"ASK_AI:{text}")
                print(f"🎤 Captured AI Question: {text}")
                ask_mode = False

            # Original photo and exit logic
            elif "photo" in text or "snap" in text:
                with open(CMD_FILE, "w") as f: f.write("PHOTO")
                ask_mode = False
            elif "exit" in text or "walk" in text:
                with open(CMD_FILE, "w") as f: f.write("EXIT_PHOTO")
                ask_mode = False
                
    except Exception as e:
        time.sleep(0.1)