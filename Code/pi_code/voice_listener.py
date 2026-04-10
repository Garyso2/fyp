import vosk
import pyaudio
import json as _json
import os
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.join(BASE_DIR, "run")
os.makedirs(RUN_DIR, exist_ok=True)
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
    print(f"❌ 無法開啟收音咪 (Error: {e})")
    exit(1)

print("🎤 [Voice Listener] Listening for commands...")
ask_mode = False  # 🌟 新增：提問模式

while True:
    try:
        data = stream.read(4000, exception_on_overflow=False)
        if rec.AcceptWaveform(data):
            res = _json.loads(rec.Result())
            text = res.get("text", "").lower().strip()
            
            if not text: continue
            
            # 將語音識別常犯嘅錯字修正返
            text = text.replace("a i", "ai").replace("hey i", "hey ai")
            print(f"👂 聽到: {text}")

            # 🌟 新增邏輯：Hi AI 問答
            if "hi ai" in text or "hey ai" in text:
                # 嘗試將 "hi ai" 後面嗰句說話切出嚟做問題
                keyword = "hi ai" if "hi ai" in text else "hey ai"
                question = text.split(keyword)[-1].strip()
                
                if question:
                    # 如果連埋問題一齊講 (例如 "hi ai what is this")
                    with open(CMD_FILE, "w") as f: f.write(f"ASK_AI:{question}")
                    print(f"🎤 Triggered AI Question: {question}")
                    ask_mode = False
                else:
                    # 如果淨係講咗 "hi ai"，就等佢下一句先當係問題
                    ask_mode = True
                    print("🎤 AI is waiting for your question...")
                    
            elif ask_mode:
                # 收到下一句話，當作問題送出
                with open(CMD_FILE, "w") as f: f.write(f"ASK_AI:{text}")
                print(f"🎤 Captured AI Question: {text}")
                ask_mode = False

            # 原本嘅拍照與退出邏輯
            elif "photo" in text or "snap" in text:
                with open(CMD_FILE, "w") as f: f.write("PHOTO")
                ask_mode = False
            elif "exit" in text or "walk" in text:
                with open(CMD_FILE, "w") as f: f.write("EXIT_PHOTO")
                ask_mode = False
                
    except Exception as e:
        time.sleep(0.1)