import time, subprocess, os
from ultralytics import YOLO
from gtts import gTTS

# --- 自動設定 run 資料夾 ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.join(BASE_DIR, "run")
os.makedirs(RUN_DIR, exist_ok=True)

IMG_PATH = os.path.join(RUN_DIR, "capture_offline.jpg")
AUDIO_PATH = os.path.join(RUN_DIR, "output.mp3")

print("🔴 [Offline Vision] Loading local YOLO model...")
model = YOLO('yolov8n.pt')

while True:
    try:
        subprocess.run(["rpicam-still", "-o", IMG_PATH, "-t", "1000", "--width", "640", "--height", "480", "--nopreview", "--zsl"], check=True)
        results = model(IMG_PATH, verbose=False)
        
        objects = []
        for r in results:
            for box in r.boxes:
                name = model.names[int(box.cls)]
                if name not in objects: objects.append(name)
        
        if objects:
            sentence = "I see " + ", ".join(objects)
            tts = gTTS(sentence, lang="en")
            tts.save(AUDIO_PATH)
            subprocess.run(["mpg123", "-q", AUDIO_PATH])
        else:
            print("No objects detected.")
    except Exception as e:
        print(f"Offline Vision Error: {e}")
    
    time.sleep(2)