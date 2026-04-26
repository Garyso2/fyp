import vosk
import pyaudio
import json as _json
import os
import sys
import time
import tempfile
import struct
import math

# Allow imports from pi_code root (config.py) when run as a subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import RUN_DIR, DEVICE_ID

# --- Set command file ---
CMD_FILE = os.path.join(RUN_DIR, "voice_cmd.txt")

def write_cmd(cmd_text):
    """Atomically write a command to CMD_FILE using write-to-temp + rename."""
    fd, tmp_path = tempfile.mkstemp(dir=RUN_DIR, prefix=".voice_cmd_", suffix=".tmp")
    try:
        os.write(fd, cmd_text.encode('utf-8'))
        os.close(fd)
        os.rename(tmp_path, CMD_FILE)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

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
chat_room_active = False  # 🌟 Chat Room mode indicator
SPEAKING_LOCK = "/tmp/speaking.lock"
AI_PROCESSING_LOCK = "/tmp/ai_processing.lock"  # Held for the entire Q&A cycle (Let me look → Do you have any questions?)
STOP_FLAG = "/tmp/system_stopped.flag"  # Written when system is stopped; deleted on start
POST_SPEECH_COOLDOWN = 1.5  # Seconds to ignore mic after device stops speaking

# Minimum RMS energy to accept audio — filters out voices beyond ~1–1.5 m.
# Raise this value to require a closer/louder speaker; lower to allow more distance.
MIN_MIC_ENERGY = 400

def _audio_rms(data):
    """Return RMS amplitude of a raw Int16 PCM frame."""
    count = len(data) // 2
    if count == 0:
        return 0
    shorts = struct.unpack_from("<%dh" % count, data)
    rms = math.sqrt(sum(s * s for s in shorts) / count)
    return rms

# Clear any stale lock files left over from a previous crash
try:
    if os.path.exists(SPEAKING_LOCK):
        os.remove(SPEAKING_LOCK)
        print("🔇 [Voice Listener] Cleared stale speaking.lock")
except: pass
try:
    if os.path.exists(AI_PROCESSING_LOCK):
        os.remove(AI_PROCESSING_LOCK)
        print("🔇 [Voice Listener] Cleared stale ai_processing.lock")
except: pass

was_speaking = False      # Track previous speaking state for transition detection
speech_ended_time = 0.0   # Timestamp when device last finished speaking

while True:
    try:
        data = stream.read(4000, exception_on_overflow=False)

        # 🔇 Ignore audio that is too quiet (speaker farther than ~1–1.5 m)
        if _audio_rms(data) < MIN_MIC_ENERGY:
            continue

        currently_speaking = os.path.exists(SPEAKING_LOCK) or os.path.exists(AI_PROCESSING_LOCK)

        # 🔇 If device is currently speaking / processing Q&A, flush buffer and skip recognition
        if currently_speaking:
            was_speaking = True
            continue  # Discard buffered audio, do NOT call AcceptWaveform

        # 🔇 Detect transition: device just stopped speaking → start cooldown
        if was_speaking and not currently_speaking:
            speech_ended_time = time.time()
            was_speaking = False

        # 🔇 Post-speech cooldown: ignore mic for a moment after device stops
        if speech_ended_time > 0.0 and (time.time() - speech_ended_time < POST_SPEECH_COOLDOWN):
            continue  # Still in cooldown, discard audio
        else:
            speech_ended_time = 0.0  # Cooldown done, reset

        if rec.AcceptWaveform(data):
            res = _json.loads(rec.Result())
            text = res.get("text", "").lower().strip()
            
            if not text: continue
            
            # Fix common speech recognition errors
            text = text.replace("a i", "ai").replace("hey i", "hey ai")
            # Normalize common Vosk mishearings of "hi ai" / "hey ai"
            text = text.replace("high ai", "hi ai").replace("hi i", "hi ai")
            text = text.replace("hi a ", "hi ai ").replace("hi a.", "hi ai")
            text = text.replace("hey a ", "hey ai ").replace("hey a.", "hey ai")
            text = text.replace("hi eye", "hi ai").replace("hey eye", "hey ai")
            print(f"👂 Recognized: {text}")

            def is_wake_word(t):
                """Catch all common Vosk mishearings of the wake word."""
                triggers = ["hi ai", "hey ai", "hi all", "hey all", "high i", "hi i"]
                return any(tr in t for tr in triggers)

            # ── STOP SYSTEM command (works even in chat room mode) ──────────
            if any(p in text for p in ["stop system", "stop the system", "system stop",
                                        "stop device", "stop the device", "device stop",
                                        "salt stop", "stopped device", "top system"]):
                chat_room_active = False
                with open(CMD_FILE, "w") as f: f.write("SYSTEM_STOP")
                # Write stop flag so safety_hardware also knows to pause
                with open(STOP_FLAG, "w") as f: f.write("1")
                print("🛑 [Voice] STOP SYSTEM command sent")
                continue

            # ── START command to resume ──────────────────────────────────────
            if any(p in text for p in ["start system", "start the system", "system start", "start"]):
                with open(CMD_FILE, "w") as f: f.write("SYSTEM_START")
                # Remove stop flag so sensors resume
                try:
                    if os.path.exists(STOP_FLAG):
                        os.remove(STOP_FLAG)
                except: pass
                print("▶️  [Voice] START SYSTEM command sent")
                continue

            # ── Battery query ────────────────────────────────────────────────
            if any(p in text for p in ["battery", "battery life", "battery level", "battery status"]):
                with open(CMD_FILE, "w") as f: f.write("BATTERY_STATUS")
                print("🔋 [Voice] Battery query sent")
                continue

            # 🌟 Chat Room Mode: All sentences become AI questions
            if is_wake_word(text):
                chat_room_active = True
                write_cmd("CHAT_ROOM_OPEN")
                print("💬 Chat Room OPENED - Device will greet. Say 'bye' to exit.")
                
            elif "bye" in text and chat_room_active:
                chat_room_active = False
                write_cmd("CHAT_ROOM_EXIT")
                print("💬 Chat Room CLOSED")
                
            elif chat_room_active:
                # In chat room: every sentence becomes an AI question
                write_cmd(f"ASK_AI:{text}")
                print(f"💬 [Chat Room] Question: {text}")

            # Photo is now triggered by five-finger gesture (see GestureListener)
            # Voice photo command removed intentionally

            elif "exit" in text or "walk" in text:
                write_cmd("EXIT_PHOTO")
                print(f"🚶 Exit walking mode")
                
    except Exception as e:
        print(f"❌ [Voice Listener] Main loop error: {e}")
        time.sleep(0.1)