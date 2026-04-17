import time, subprocess, os, sys

# Allow imports from pi_code root (config.py) when run as a subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ultralytics import YOLO
from gtts import gTTS
from config import RUN_DIR, DEVICE_ID

# Force Python to output immediately, don't buffer prints
sys.stdout.reconfigure(line_buffering=True)

# --- Set file paths ---
IMG_PATH = os.path.join(RUN_DIR, "capture_offline.jpg")
AUDIO_PATH = os.path.join(RUN_DIR, "output.mp3")
CMD_FILE = os.path.join(RUN_DIR, "voice_cmd.txt")

print("🔴 [Offline Vision] Loading local YOLO model...")
model = YOLO('yolov8n.pt')
print("✅ [Offline Vision] YOLO model loaded successfully!")
print("🎤 [Offline Vision - Idle] Waiting for voice command...")

while True:
    try:
        # Check if voice command file exists and contains "PHOTO" command
        if os.path.exists(CMD_FILE):
            try:
                with open(CMD_FILE, "r") as f:
                    cmd = f.read().strip()
                
                # If photo command received, take photo and analyze
                if cmd == "PHOTO":
                    print("📷 [Offline Vision - Analysis Mode] PHOTO command received! Capturing...")
                    
                    # Capture image
                    result = subprocess.run(
                        ["rpicam-still", "-o", IMG_PATH, "-t", "1000", "--width", "640", "--height", "480", "--nopreview", "--zsl"],
                        capture_output=True,
                        timeout=5
                    )
                    
                    if result.returncode == 0 and os.path.exists(IMG_PATH):
                        # Run object detection
                        results = model(IMG_PATH, verbose=False)
                        
                        objects = []
                        for r in results:
                            for box in r.boxes:
                                name = model.names[int(box.cls)]
                                if name not in objects:
                                    objects.append(name)
                        
                        # Generate speech response
                        if objects:
                            sentence = "I see " + ", ".join(objects)
                            print(f"✅ [Offline Vision - Analysis Mode] Detected: {sentence}")
                            
                            try:
                                tts = gTTS(sentence, lang="en")
                                tts.save(AUDIO_PATH)
                                subprocess.run(["mpg123", "-q", AUDIO_PATH], timeout=10)
                            except Exception as e:
                                print(f"⚠️ [Offline Vision - Analysis Mode] TTS Error: {e}")
                        else:
                            print("⚠️ [Offline Vision - Analysis Mode] No objects detected.")
                        
                        # Clear command file after processing
                        os.remove(CMD_FILE)
                    else:
                        print("❌ [Offline Vision - Analysis Mode] Failed to capture image")
                        
            except Exception as e:
                print(f"❌ [Offline Vision] Error reading command: {e}")
        
        # Sleep briefly to avoid busy waiting
        time.sleep(0.5)
        
    except Exception as e:
        print(f"❌ [Offline Vision - Main Loop] Error: {e}")
        time.sleep(1)