import os
import sys
import time
import tempfile
import json as _json

# Suppress ALSA/JACK spam before pyaudio/speech_recognition load
import ctypes

# Tell JACK not to try auto-starting or auto-connecting
os.environ.setdefault("JACK_NO_START_SERVER", "1")
os.environ.setdefault("JACK_NO_AUDIO_RESERVATION", "1")

# Silence ALSA C-level error handler (keep reference to avoid GC → segfault)
try:
    _asound = ctypes.cdll.LoadLibrary("libasound.so.2")
    _ERROR_HANDLER_FUNC = ctypes.CFUNCTYPE(
        None, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p
    )
    _c_error_handler = _ERROR_HANDLER_FUNC(lambda *args: None)
    _asound.snd_lib_error_set_handler(_c_error_handler)
except Exception:
    pass

# Silence JACK C-level error/info handlers (keep references to avoid GC → segfault)
try:
    _libjack = ctypes.cdll.LoadLibrary("libjack.so.0")
    _JACK_ERROR_FUNC = ctypes.CFUNCTYPE(None, ctypes.c_char_p)
    _c_jack_error_handler = _JACK_ERROR_FUNC(lambda *args: None)
    _c_jack_info_handler  = _JACK_ERROR_FUNC(lambda *args: None)
    _libjack.jack_set_error_function(_c_jack_error_handler)
    _libjack.jack_set_info_function(_c_jack_info_handler)
except Exception:
    pass

# Redirect fd 2 to /dev/null for any remaining C-library stderr spam during import
_devnull_fd = os.open(os.devnull, os.O_WRONLY)
_saved_stderr_fd = os.dup(2)
os.dup2(_devnull_fd, 2)

import speech_recognition as sr
import vosk

# Restore stderr after noisy imports
os.dup2(_saved_stderr_fd, 2)
os.close(_saved_stderr_fd)
os.close(_devnull_fd)

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

# ── Vosk offline fallback ────────────────────────────────────────────────────
vosk.SetLogLevel(-1)  # Suppress Vosk internal LOG (VoskAPI:...) messages
_vosk_model_path = os.path.expanduser("~/vosk-model-small-en-us-0.15")
if os.path.exists(_vosk_model_path):
    _vosk_model = vosk.Model(_vosk_model_path)
    print("✅ [Voice] Vosk offline fallback model loaded.")
else:
    _vosk_model = None
    print("⚠️  [Voice] Vosk model not found — offline fallback unavailable.")

def _recognize_vosk_fallback(audio: sr.AudioData) -> str:
    """Decode AudioData with Vosk when Google is unavailable (offline)."""
    if _vosk_model is None:
        return ""
    try:
        raw = audio.get_raw_data(convert_rate=16000, convert_width=2)
        rec = vosk.KaldiRecognizer(_vosk_model, 16000)
        rec.AcceptWaveform(raw)
        return _json.loads(rec.FinalResult()).get("text", "").strip()
    except Exception:
        return ""

# ── SpeechRecognition setup ──────────────────────────────────────────────────
r = sr.Recognizer()
r.energy_threshold        = 400   # Minimum mic energy to start capturing
r.dynamic_energy_threshold = True  # Auto-adjust for ambient noise levels
r.pause_threshold          = 0.7   # Seconds of silence = end of phrase
r.non_speaking_duration    = 0.5   # Seconds of silence kept at start/end

def _suppress_stderr():
    """Context manager: redirect C-level stderr to /dev/null."""
    import contextlib
    @contextlib.contextmanager
    def _ctx():
        fd = os.open(os.devnull, os.O_WRONLY)
        saved = os.dup(2)
        os.dup2(fd, 2)
        try:
            yield
        finally:
            os.dup2(saved, 2)
            os.close(saved)
            os.close(fd)
    return _ctx()

with _suppress_stderr():
    mic = sr.Microphone(sample_rate=16000)  # 16 kHz: best for both Google & Vosk

print("🎤 [Voice] Calibrating for ambient noise (2 s) — please be quiet…")
with _suppress_stderr(), mic as source:
    r.adjust_for_ambient_noise(source, duration=2)
print(f"🎤 [Voice] Energy threshold set to {r.energy_threshold:.0f}")

# ── State ────────────────────────────────────────────────────────────────────
chat_room_active   = False
SPEAKING_LOCK      = "/tmp/speaking.lock"
AI_PROCESSING_LOCK = "/tmp/ai_processing.lock"
STOP_FLAG          = "/tmp/system_stopped.flag"
POST_SPEECH_COOLDOWN = 0.5  # Brief echo cooldown after device stops speaking

# Calibrated energy threshold — restored after AI speech to undo echo-inflated values
_calibrated_threshold = r.energy_threshold

# When device speech ends, set this to silence the mic briefly.
_ignore_until    = 0.0
_lock_was_active = False  # Tracks lock present→absent transition

# Clear any stale lock files left from a previous crash
for _lk in (SPEAKING_LOCK, AI_PROCESSING_LOCK):
    try:
        if os.path.exists(_lk):
            os.remove(_lk)
            print(f"🔇 [Voice] Cleared stale {os.path.basename(_lk)}")
    except Exception:
        pass

# ── Text helpers ─────────────────────────────────────────────────────────────
def _normalize(text: str) -> str:
    t = text.lower().strip()
    t = t.replace("a i", "ai")
    for m in ("high ai", "hi eye", "hey eye", "hi i", "hey i", "hi all", "hey all", "hi a", "hey a"):
        t = t.replace(m, "hi ai")
    for m in ("salt stop", "stopped device", "top system"):
        t = t.replace(m, "stop system")
    return t

def is_wake_word(t: str) -> bool:
    return any(tr in t for tr in [
        "hi ai", "hey ai", "hi all", "hey all", "high ai",
        "hi eye", "hey eye", "hi i", "hey i", "hi a", "hey a",
    ])

# ── Command dispatcher ────────────────────────────────────────────────────────
def _handle_text(raw: str):
    global chat_room_active, _ignore_until
    text = _normalize(raw)
    if not text:
        return
    print(f"👂 Recognized: {text}")

    # STOP SYSTEM (always active, even inside chat room)
    if any(kw in text for kw in [
        "stop system", "stop the system", "system stop",
        "stop device", "stop the device", "device stop",
    ]):
        chat_room_active = False
        write_cmd("SYSTEM_STOP")
        with open(STOP_FLAG, "w") as f:
            f.write("1")
        print("🛑 [Voice] STOP SYSTEM")
        return

    # START / RESUME
    if any(kw in text for kw in [
        "start system", "start the system", "system start", "start",
    ]):
        write_cmd("SYSTEM_START")
        try:
            if os.path.exists(STOP_FLAG):
                os.remove(STOP_FLAG)
        except Exception:
            pass
        print("▶️  [Voice] START SYSTEM")
        return

    # Battery
    if "battery" in text:
        write_cmd("BATTERY_STATUS")
        print("🔋 [Voice] Battery query")
        return

    # Wake word → open chat room
    if is_wake_word(text):
        chat_room_active = True
        write_cmd("CHAT_ROOM_OPEN")
        print("💬 Chat Room OPENED — Say 'bye' to exit.")
        return

    # Exit chat room
    if "bye" in text and chat_room_active:
        chat_room_active = False
        write_cmd("CHAT_ROOM_EXIT")
        print("💬 Chat Room CLOSED")
        return

    # Chat room free-form question
    if chat_room_active:
        write_cmd(f"ASK_AI:{text}")
        print(f"💬 [Chat Room] Question: {text}")
        return

    # Exit / walking mode
    if "exit" in text or "walk" in text:
        write_cmd("EXIT_PHOTO")
        print("🚶 Exit walking mode")

# ── Background listener callback ─────────────────────────────────────────────
def _callback(recognizer: sr.Recognizer, audio: sr.AudioData):
    global _ignore_until, _lock_was_active

    currently_locked = os.path.exists(SPEAKING_LOCK) or os.path.exists(AI_PROCESSING_LOCK)

    if currently_locked:
        _lock_was_active = True
        # Don't extend _ignore_until here — it will be set precisely on unlock
        return

    # Lock just released: reset threshold and set a short, fixed cooldown
    if _lock_was_active:
        _lock_was_active = False
        recognizer.energy_threshold = _calibrated_threshold  # undo echo inflation
        _ignore_until = time.time() + POST_SPEECH_COOLDOWN
        return  # Drop this segment — likely captured during AI speech/echo

    # Still within the post-unlock echo cooldown
    if time.time() < _ignore_until:
        return

    raw_text = ""
    try:
        # Primary: Google Web Speech API — accurate, low-latency, needs internet
        raw_text = recognizer.recognize_google(audio, language="en-US")
    except sr.UnknownValueError:
        pass  # Inaudible / no speech detected
    except sr.RequestError:
        # No internet — fall back to local Vosk model
        raw_text = _recognize_vosk_fallback(audio)

    if raw_text:
        _handle_text(raw_text)

# ── Start continuous background listener ─────────────────────────────────────
print("🎤 [Voice Listener] Listening (Google Speech + Vosk offline fallback)…")
with _suppress_stderr():
    _stop_listening = r.listen_in_background(mic, _callback, phrase_time_limit=10)

try:
    while True:
        time.sleep(0.1)
except KeyboardInterrupt:
    _stop_listening(wait_for_stop=False)
    print("🎤 [Voice Listener] Stopped.")