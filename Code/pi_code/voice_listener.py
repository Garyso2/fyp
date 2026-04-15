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

# Choose a valid input device whenever possible.
def select_input_device(pa):
    preferred_names = ["pcm2902", "texas instruments", "audio codec", "usb"]

    def log_input_devices():
        print("🎤 Available input devices:")
        for idx in range(pa.get_device_count()):
            info = pa.get_device_info_by_index(idx)
            if info.get('maxInputChannels', 0) > 0:
                print(f"  [{idx}] {info.get('name')} | channels={info.get('maxInputChannels')} | rate={info.get('defaultSampleRate')}")

    try:
        info = pa.get_default_input_device_info()
        info['index'] = int(info.get('index', 0))
        return info
    except Exception:
        pass

    env_device = os.environ.get('VOICE_INPUT_DEVICE')
    if env_device:
        for idx in range(pa.get_device_count()):
            info = pa.get_device_info_by_index(idx)
            if info.get('maxInputChannels', 0) > 0 and env_device.lower() in info.get('name', '').lower():
                info['index'] = idx
                return info

    candidates = []
    for idx in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(idx)
        if info.get('maxInputChannels', 0) > 0:
            info['index'] = idx
            name = info.get('name', '').lower()
            candidates.append(info)
            if any(pref in name for pref in preferred_names):
                return info

    if candidates:
        # Fallback to first available input device if no preferred device is found.
        log_input_devices()
        print("🎤 Using first available input device because no preferred device was found.")
        return candidates[0]

    raise RuntimeError("No input device available")

try:
    device_info = select_input_device(p)
    mic_rate = int(device_info.get('defaultSampleRate', 16000))
    input_device_index = int(device_info['index'])
    print(f"🎤 Using input device: {device_info.get('name')} (index={input_device_index})")
except Exception as e:
    print(f"❌ Cannot find a microphone input device (Error: {e})")
    p.terminate()
    exit(1)

rec = vosk.KaldiRecognizer(model, mic_rate)

try:
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=mic_rate,
        input=True,
        input_device_index=input_device_index,
        frames_per_buffer=4000,
    )
    stream.start_stream()
except Exception as e:
    print(f"❌ Cannot open microphone (Error: {e})")
    p.terminate()
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
            elif "photo" in text or "snap" in text or "take phone" in text:
                with open(CMD_FILE, "w") as f: f.write("PHOTO")
                ask_mode = False
            elif "exit" in text or "walk" in text:
                with open(CMD_FILE, "w") as f: f.write("EXIT_PHOTO")
                ask_mode = False
                
    except Exception as e:
        time.sleep(0.1)