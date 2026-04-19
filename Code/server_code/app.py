import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, Request, HTTPException, Header
from ultralytics import YOLO
import torch
import mediapipe as mp
from contextlib import asynccontextmanager
import os
import time
import asyncio
import logging
from collections import deque, Counter
import openai
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from supabase import Client, create_client


# Thread pool: run gesture recognition and debug image saving in parallel
global_executor = ThreadPoolExecutor(max_workers=2)

# ================= Initialization =================
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("yolo_server")

API_KEY = os.getenv("API_KEY", "yoloProject2026")
GITHUB_API_KEY = os.getenv("GITHUB_API_KEY", "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")
GITHUB_MODEL = os.getenv("GITHUB_MODEL", "gpt-4o-mini")
DEBUG_VIEW = os.getenv("DEBUG_VIEW", "true").lower() == "true"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://iobnjmawpmtzsiojkauo.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYm5qbWF3cG10enNpb2prYXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjMwOTksImV4cCI6MjA4NTQ5OTA5OX0.uV0rzfM2T-K3Z-0l7gPfBOKTqF6B4KCz0KnCHWOm-LI")

ml_models = {}
supabase_client: Client | None = None

FRAME_COUNTER = 0
LAST_GESTURE = "None"
GESTURE_SKIP_FRAMES = 2

OBSTACLE_HISTORY = deque(maxlen=5) 
PROCESSING_LOCK = asyncio.Lock()
COLOR_HISTORY = deque(maxlen=3)

# Pi Camera Module 3 NoIR Wide: focal 2.75mm, HFoV ~102°
# Used only for vehicle distance estimation; person distance is handled differently
FOCAL_LENGTH_PIXEL = 260
MIN_BBOX_WIDTH = 20

REAL_WORLD_WIDTH = {
    "person": 0.5, "car": 1.8, "bus": 2.5, "truck": 2.5,
    "motorcycle": 0.8, "stop sign": 0.75
}

# Lower confidence thresholds for distant objects
LOW_CONF_OBJECTS = ["traffic light", "car", "bus", "truck"]

mp_hands = mp.solutions.hands
hands_detector = mp_hands.Hands(
    static_image_mode=False, max_num_hands=1,
    min_detection_confidence=0.6, min_tracking_confidence=0.5
)

GESTURE_HISTORY = deque(maxlen=3)  # Gesture smoothing: vote over the latest 3 frames

# NoIR lens: infrared light lowers saturation, so reduce S thresholds
TRAFFIC_LIGHT_COLORS = {
    "Red": [(np.array([0, 60, 80]), np.array([10, 255, 255])),
            (np.array([160, 60, 80]), np.array([180, 255, 255]))],
    "Green": [(np.array([35, 60, 80]), np.array([90, 255, 255]))]
}

# NoIR tuning: lower saturation thresholds to compensate for infrared color shift
GENERAL_COLORS = {
    "Black": [(np.array([0, 0, 0]), np.array([180, 255, 50]))],
    "White": [(np.array([0, 0, 200]), np.array([180, 30, 255]))],
    "Red":   [(np.array([0, 40, 50]), np.array([10, 255, 255])),
              (np.array([160, 40, 50]), np.array([180, 255, 255]))],
    "Blue":  [(np.array([90, 35, 50]), np.array([130, 255, 255]))],
    "Yellow":[(np.array([20, 60, 80]), np.array([35, 255, 255]))],
    "Green": [(np.array([35, 35, 50]), np.array([85, 255, 255]))]
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase_client
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    ml_models["device"] = device
    if device == 'cuda:0':
        torch.backends.cudnn.benchmark = True
        # Enable TF32 for faster matrix operations (supported by RTX 4080 Super)
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        
    logger.info(f"Loading YOLO11x on {device}...")
    
    # Try loading TensorRT engine; if unavailable, fall back to the PyTorch model
    engine_path = "yolo11x.engine"
    if device == 'cuda:0' and os.path.exists(engine_path):
        logger.info("Loading TensorRT engine (fastest)...")
        model = YOLO(engine_path)
    else:
        model = YOLO("yolo11x.pt")
        if device == 'cuda:0':
            logger.info("💡 TIP: Export TensorRT engine for 3-5x speedup:")
            logger.info("   yolo export model=yolo11x.pt format=engine imgsz=1280 half=True")
            logger.info("   Then restart the server.")
            
    # Warm-up (3 runs to ensure CUDA kernels are fully compiled)
    dummy = np.zeros((640, 640, 3), dtype=np.uint8)
    for _ in range(3):
        model.predict(dummy, device=device, imgsz=1280, half=(device=='cuda:0'), verbose=False)
    if device == 'cuda:0':
        torch.cuda.synchronize()
    ml_models["model"] = model
    logger.info(f"Model loaded and warmed up on {device}.")
    
    # Report GPU information
    if device == 'cuda:0':
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        logger.info(f"🎮 GPU: {gpu_name} ({gpu_mem:.1f} GB)")

    # GitHub Models API
    if GITHUB_API_KEY:
        gh_client = openai.OpenAI(
            base_url="https://models.inference.ai.azure.com",
            api_key=GITHUB_API_KEY
        )
        ml_models["gh_client"] = gh_client
        logger.info(f"GitHub Models configured (model: {GITHUB_MODEL}).")
    else:
        logger.warning("GITHUB_API_KEY not set, /analyze_detail will be unavailable.")

    if SUPABASE_URL and SUPABASE_KEY:
        try:
            supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            logger.info("Supabase client initialized.")
        except Exception as e:
            supabase_client = None
            logger.error(f"Failed to initialize Supabase client: {e}")
    else:
        logger.warning("SUPABASE_URL or SUPABASE_KEY missing; DB APIs will be unavailable.")

    yield
    # Cleanup resources
    ml_models.clear()
    supabase_client = None
    hands_detector.close()
    if DEBUG_VIEW:
        cv2.destroyAllWindows()
    logger.info("Server shutdown complete.")

app = FastAPI(lifespan=lifespan)


def get_supabase() -> Client:
    if supabase_client is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    return supabase_client


class DeviceUpsert(BaseModel):
    device_id: str
    device_name: str
    language_setting: str = "en"


class DeviceStatusUpsert(BaseModel):
    device_id: str
    battery_level: int | None = None
    is_online: bool = False


class ActivityLogCreate(BaseModel):
    device_id: str
    activity_type: str
    detected_content: str | None = None
    image_url: str | None = None
    time: str | None = None


class UserCreate(BaseModel):
    username: str | None = None
    password: str | None = None
    device_id: str | None = None
    Language: str = "ENG"

# ================= Core Logic =================

def get_gesture(img):
    """Keep Open_Palm (mode switch) and Victory (capture again)."""
    small_img = cv2.resize(img, (320, 240))
    img_rgb = cv2.cvtColor(small_img, cv2.COLOR_BGR2RGB)
    results = hands_detector.process(img_rgb)
    
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            lm = hand_landmarks.landmark
            # Check whether four fingers are extended (index:8, middle:12, ring:16, pinky:20)
            fingers_up = [lm[i].y < lm[i-2].y for i in [8, 12, 16, 20]]
            
            # Open_Palm: all four fingers extended
            if all(fingers_up):
                return "Open_Palm"
                
            # Victory: index(0) and middle(1) extended, ring(2) and pinky(3) bent
            if fingers_up[0] and fingers_up[1] and not fingers_up[2] and not fingers_up[3]:
                return "Victory"
                
    return "None"


def get_stable_gesture(new_gesture):
    """Smooth gestures via 3-frame voting to reduce false positives."""
    GESTURE_HISTORY.append(new_gesture)
    # Require at least 2 of the latest 3 frames to match a non-None gesture
    non_none = [g for g in GESTURE_HISTORY if g != "None"]
    if len(non_none) >= 2:
        counts = Counter(non_none)
        most_common, count = counts.most_common(1)[0]
        if count >= 2:
            return most_common
    return "None"

def get_dominant_color(crop_img, use_general=False):
    if crop_img.size == 0: return ""
    h, w = crop_img.shape[:2]
    center_h, center_w = int(h*0.5), int(w*0.5)
    start_y, start_x = int(h*0.25), int(w*0.25)
    roi = crop_img[start_y:start_y+center_h, start_x:start_x+center_w]
    if roi.size == 0: roi = crop_img
    
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    max_ratio = 0.0
    detected_color = ""
    total_pixels = roi.shape[0] * roi.shape[1]
    
    target_ranges = GENERAL_COLORS if use_general else TRAFFIC_LIGHT_COLORS

    for color_name, ranges in target_ranges.items():
        mask = np.zeros(roi.shape[:2], dtype="uint8")
        for (lower, upper) in ranges:
            # Use bitwise_or to avoid uint8 overflow
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, lower, upper))
        count = cv2.countNonZero(mask)
        ratio = count / total_pixels
        
        # Use a higher threshold for general objects to reduce false positives
        threshold = 0.05 if use_general else 0.04
        
        if ratio > threshold and ratio > max_ratio:
            max_ratio = ratio
            detected_color = color_name
            
    return detected_color

def get_stable_color(new_color):
    """Smooth color detection using vote results from the latest 3 frames."""
    COLOR_HISTORY.append(new_color)
    if len(COLOR_HISTORY) == 0: return "None"
    counts = Counter(COLOR_HISTORY)
    most_common, count = counts.most_common(1)[0]
    if count >= 2: return most_common
    return "None"


def get_stable_obstacle(current_danger):
    """
    Smooth obstacle alerts using the latest 5-frame history.
    - Stop (critical danger) -> report immediately
    - Danger -> report after at least 2-frame confirmation
    - Safe -> confirm safe only when no danger exists in history
    """
    OBSTACLE_HISTORY.append(current_danger)

    # Stop-level danger: report immediately
    if current_danger.startswith("Stop"):
        return current_danger

    # Count danger messages in history
    danger_msgs = [msg for msg in OBSTACLE_HISTORY if msg != "Safe"]
    if len(danger_msgs) >= 2:
        return danger_msgs[-1]

    return "Safe"


# ================= API Endpoints =================

@app.get("/health")
async def health():
    """Health-check endpoint for startup connectivity verification on Pi."""
    return {
        "status": "ok",
        "model_loaded": "model" in ml_models,
        "device": ml_models.get("device", "unknown")
    }


@app.get("/db/health")
async def db_health():
    db = get_supabase()
    try:
        # Use an inexpensive query to validate connectivity.
        db.table("device").select("device_id").limit(1).execute()
        return {"status": "ok", "supabase": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase health check failed: {e}")


@app.post("/db/device")
async def upsert_device(payload: DeviceUpsert):
    db = get_supabase()
    try:
        result = db.table("device").upsert(payload.model_dump()).execute()
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upsert device: {e}")


@app.post("/db/device_status")
async def upsert_device_status(payload: DeviceStatusUpsert):
    db = get_supabase()
    try:
        row = payload.model_dump()
        row["last_updated"] = datetime.now(timezone.utc).isoformat()
        result = db.table("device_status").upsert(row).execute()
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upsert device status: {e}")


@app.post("/db/activity_logs")
async def create_activity_log(payload: ActivityLogCreate):
    db = get_supabase()
    try:
        result = db.table("activity_logs").insert(payload.model_dump()).execute()
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert activity log: {e}")


@app.get("/db/activity_logs/{device_id}")
async def get_activity_logs(device_id: str, limit: int = 20):
    db = get_supabase()
    try:
        safe_limit = max(1, min(limit, 200))
        result = (
            db.table("activity_logs")
            .select("*")
            .eq("device_id", device_id)
            .order("activity_id", desc=True)
            .limit(safe_limit)
            .execute()
        )
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query activity logs: {e}")


@app.post("/db/user")
async def create_user(payload: UserCreate):
    db = get_supabase()
    try:
        result = db.table("user").insert(payload.model_dump()).execute()
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create user: {e}")


@app.get("/db/user/by_device/{device_id}")
async def get_users_by_device(device_id: str):
    db = get_supabase()
    try:
        result = db.table("user").select("*").eq("device_id", device_id).execute()
        return {"status": "ok", "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query users: {e}")


@app.post("/detect_stream")
async def detect_stream(request: Request, x_api_key: str | None = Header(default=None)):
    global FRAME_COUNTER, LAST_GESTURE
    if x_api_key != API_KEY: raise HTTPException(status_code=401, detail="Unauthorized")

    async with PROCESSING_LOCK:
        try:
            data = await request.body()
            t_start = time.time()
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if img is None: return {"error": "Invalid image"}

            model = ml_models["model"]
            device = ml_models["device"]
            is_cuda = (device == 'cuda:0')

            # 1. Run gesture recognition and YOLO in parallel
            FRAME_COUNTER += 1
            gesture_future = None
            if FRAME_COUNTER % GESTURE_SKIP_FRAMES == 0:
                # Run gesture on CPU in parallel with GPU YOLO
                gesture_future = global_executor.submit(get_gesture, img)

            # 2. YOLO (1280px, conf 0.20)
            t_yolo = time.time()
            results = model.predict(img, imgsz=1280, conf=0.20, device=device, half=is_cuda, verbose=False)[0]
            yolo_ms = int((time.time() - t_yolo) * 1000)
            
            # Get gesture result
            gesture = LAST_GESTURE
            if gesture_future is not None:
                raw_gesture = gesture_future.result(timeout=1)
                gesture = get_stable_gesture(raw_gesture)
                LAST_GESTURE = gesture
            mode_switch = (gesture == "Open_Palm")
            
            annotated_frame = results.plot() if DEBUG_VIEW else None

            # 3. Logic processing
            current_frame_danger = "Safe"
            primary_detected_color = "None"
            nearest_object = ""  # Largest (nearest) object in the frame
            max_bbox_area = 0
            
            boxes = results.boxes
            if len(boxes) > 0:
                cls_ids = boxes.cls.int().cpu().numpy()
                xyxys = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()
                names = model.names
                
                for i, cls_id in enumerate(cls_ids):
                    cls_name = names[cls_id]
                    confidence = confs[i]
                    x1, y1, x2, y2 = map(int, xyxys[i])
                    
                    threshold = 0.30 if cls_name in LOW_CONF_OBJECTS else 0.50
                    if confidence < threshold: continue

                    # === Color detection logic ===
                    obj_color = "None"
                    
                    # A. Skip traffic light color detection due to unstable NoIR color accuracy
                    if cls_name == "traffic light":
                        continue  # Skip: do not include traffic light color in output

                    # B. General objects (vehicle/person)
                    elif cls_name in ["car", "bus", "truck", "person"]:
                        crop = img[y1:y2, x1:x2]
                        obj_color = get_dominant_color(crop, use_general=True)
                        
                        if primary_detected_color == "None" and obj_color != "None":
                            primary_detected_color = obj_color
                            # Debug: print detected color in backend console
                            if DEBUG_VIEW:
                                print(f"🎨 Detected {obj_color} on {cls_name}")

                    # Debug overlay
                    if DEBUG_VIEW and annotated_frame is not None and obj_color != "None":
                         cv2.putText(annotated_frame, f"{obj_color}", (x1, y1-20), 
                                     cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

                    # Distance estimation
                    if cls_name in REAL_WORLD_WIDTH:
                        bbox_width = float(x2 - x1)
                        bbox_height = float(y2 - y1)
                        if bbox_width < MIN_BBOX_WIDTH:
                            continue

                        # Track the largest object in frame (for ultrasonic-triggered output)
                        bbox_area = bbox_width * bbox_height
                        if bbox_area > max_bbox_area:
                            max_bbox_area = bbox_area
                            # Prefix color only for vehicles, not for person
                            if cls_name != "person" and obj_color and obj_color != "None":
                                nearest_object = f"{obj_color} {cls_name}"
                            else:
                                nearest_object = cls_name

                        # Person: distance is handled by ultrasonic sensor, not camera
                        if cls_name == "person":
                            continue

                        # Vehicle/motorcycle: camera-based distance formula
                        img_w = float(img.shape[1])
                        distance = (REAL_WORLD_WIDTH[cls_name] * FOCAL_LENGTH_PIXEL) / bbox_width
                        logger.info(f"📏 {cls_name}: bbox_w={bbox_width:.0f}px, dist={distance:.2f}m")
                    
                        if DEBUG_VIEW and annotated_frame is not None:
                            cv2.putText(annotated_frame, f"{distance:.1f}m", (x1, y1-5), 
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                        if cls_name in ["car", "bus", "truck"]:
                            # Compute object position in the image (left/center/right)
                            img_w = float(img.shape[1])
                            center_x = (x1 + x2) / 2
                            if center_x < img_w * 0.33:
                                position = "on your left"
                            elif center_x > img_w * 0.67:
                                position = "on your right"
                            else:
                                position = "straight ahead"
                                
                            # Include position in danger alerts
                            if distance < 1.0: 
                                current_frame_danger = f"Stop! {cls_name} {position}"
                            elif distance < 1.5: 
                                current_frame_danger = f"Danger: {cls_name} {position}"

            # 4. Smoothing
            final_color = get_stable_color(primary_detected_color)
            final_obstacle_msg = get_stable_obstacle(current_frame_danger)

            # Debug view (save in background thread to avoid blocking response)
            if DEBUG_VIEW and annotated_frame is not None:
                global_executor.submit(cv2.imwrite, "debug_latest.jpg", annotated_frame)

            elapsed_ms = int((time.time() - t_start) * 1000)
            return {
                "switch_mode": mode_switch,
                "obstacle": final_obstacle_msg, 
                "gesture": gesture,
                "color": final_color,
                "nearest_object": nearest_object,
                "timings": {"total": elapsed_ms, "yolo": yolo_ms}
            }
        except Exception as e:
            logger.error(f"detect_stream error: {e}", exc_info=True)
            return {"error": str(e)}

@app.post("/analyze_detail")
async def analyze_detail(request: Request, x_api_key: str | None = Header(default=None)):
    if x_api_key != API_KEY: raise HTTPException(status_code=401, detail="Unauthorized")
    
    gh_client = ml_models.get("gh_client")
    if not gh_client:
        return {"description": "GitHub Models API not configured."}
    
    try:
        data = await request.body()

        if DEBUG_VIEW:
            with open("debug_detail.jpg", "wb") as f:
                f.write(data)

        img_b64 = base64.b64encode(data).decode("utf-8")

        def _call_github():
            return gh_client.chat.completions.create(
                model=GITHUB_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": (
                            "You are an assistant for a visually impaired person. "
                            "Describe what you see in this image in 1-2 short sentences. "
                            "Focus on: people, vehicles, obstacles, traffic lights/signs, "
                            "and anything relevant for safe navigation. "
                            "Be concise and speak naturally, as this will be read aloud."
                        )},
                        {"type": "image_url", "image_url": {
                            "url": f"data:image/jpeg;base64,{img_b64}"
                        }}
                    ]
                }],
                max_tokens=150
            )

        response = await asyncio.to_thread(_call_github)
        description = response.choices[0].message.content.strip()
        logger.info(f"GitHub Models response: {description}")
        # Automatically write AI description to Supabase
        try:
            db = get_supabase()
            device_id = request.headers.get("x-device-id", "PI_001")

            # Compute Hong Kong time (UTC+8) in YYYY-MM-DD HH:MM:SS format
            hk_tz = timezone(timedelta(hours=8))
            formatted_hk_time = datetime.now(hk_tz).strftime('%Y-%m-%d %H:%M:%S')
            db.table("activity_logs").insert({
                "device_id": device_id,
                "activity_type": "AI_SCENE_ANALYSIS",
                "detected_content": description,
                "time": formatted_hk_time
            }).execute()
            logger.info("💾 Successfully backed up AI description to Supabase")
        except Exception as db_err:
            logger.error(f"⚠️ Supabase write failed: {db_err}")
        return {"description": description}
    except Exception as e:
        logger.error(f"analyze_detail error: {e}", exc_info=True)
        return {"description": "Analysis failed."}

@app.post("/ask_ai")
async def ask_ai(question: str, request: Request, x_api_key: str | None = Header(default=None)):
    if x_api_key != API_KEY: raise HTTPException(status_code=401, detail="Unauthorized")
    
    gh_client = ml_models.get("gh_client")
    if not gh_client:
        return {"answer": "GitHub Models API not configured."}
    
    try:
        data = await request.body()
        img_b64 = base64.b64encode(data).decode("utf-8")
        logger.info(f"🎤 [Ask AI] User question: {question}")

        # Weather interception flow (HKO API: realtime temperature + rain probability)
        question_lower = question.lower()
        live_weather_data = ""
        weather_keywords = ["weather", "temperature", "rain", "hot", "cold"]
        
        if any(kw in question_lower for kw in weather_keywords):
            try:
                import requests
                weather_status = ""
                
                # 1. Call realtime weather API (latest temperature + current rainfall)
                res_now = requests.get("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en", timeout=3)
                if res_now.status_code == 200:
                    w_data = res_now.json()
                    temp = w_data.get("temperature", {}).get("data", [{}])[0].get("value", "unknown")
                    rainfall = w_data.get("rainfall", {}).get("data", [{}])[0].get("max", 0)
                    weather_status += f"Current temperature is {temp}°C."
                    if rainfall > 0:
                        weather_status += " It is currently raining."
                
                # 2. Call 9-day forecast API (today's rain probability)
                res_forecast = requests.get("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=en", timeout=3)
                if res_forecast.status_code == 200:
                    f_data = res_forecast.json()
                    today_forecast = f_data.get("weatherForecast", [{}])[0]
                    psr = today_forecast.get("PSR", "unknown")  # Probability of Significant Rain
                    weather_status += f" The probability of rain today is {psr}."
                    
                if weather_status:
                    # Combine weather data into system context for the model
                    live_weather_data = f"[System Info: Hong Kong Weather - {weather_status}]"
                    logger.info(f"🌤️ Successfully fetched weather data: {weather_status}")
            except Exception as e:
                logger.error(f"⚠️ Failed to fetch weather data: {e}")

        # 2. Call GPT-4o-mini
        def _call_github_ask():
            ocr_keywords = ["read", "text", "menu"]
            is_ocr = any(kw in question_lower for kw in ocr_keywords)

            from datetime import timedelta
            hk_time = (datetime.now(timezone.utc) + timedelta(hours=8)).strftime('%Y-%m-%d %I:%M %p')

            if is_ocr:
                # OCR-focused mode (read text/menu)
                system_prompt = (
                    "You are a helpful reading assistant for a visually impaired person. "
                    "Please focus on reading the text visible in the provided image clearly and logically. "
                    "Do not describe the environment or scenery, just read the text. "
                    "Reply in the same language as the text or the user's question."
                )
            else:
                # Navigation support + general conversation mode
                system_prompt = (
                    "You are a friendly and helpful AI assistant for a visually impaired person. "
                    f"[System Info: Current Hong Kong Time is {hk_time}] "
                    f"{live_weather_data} "
                    "Guidelines: "
                    "- If the user makes general conversation (e.g., greetings, jokes), reply naturally. "
                    "- If the user asks about their surroundings or the weather, use the image and system info to answer accurately. "
                    "- Keep your answers short, direct, and natural as they will be spoken aloud."
                )

            # Keep prompts separated into system and user roles
            return gh_client.chat.completions.create(
                model=GITHUB_MODEL,
                messages=[
                    {
                        "role": "system", 
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": f"The user says: {question}"},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                        ]
                    }
                ],
                max_tokens=250
            )

        response = await asyncio.to_thread(_call_github_ask)
        answer = response.choices[0].message.content.strip()
        logger.info(f"🤖 [Ask AI] AI Response: {answer}")
        
        # 3. Persist conversation to Supabase
        try:
            db = get_supabase()
            device_id = request.headers.get("x-device-id", "PI_001")
            
            # Simple cleanup to keep log content predictable
            log_content = f"Q: {question} | A: {answer}"

            # Compute Hong Kong time (UTC+8) in YYYY-MM-DD HH:MM:SS format
            hk_tz = timezone(timedelta(hours=8))
            formatted_hk_time = datetime.now(hk_tz).strftime('%Y-%m-%d %H:%M:%S')
            
            db.table("activity_logs").insert({
                "device_id": device_id,
                "activity_type": "AI_Chat",  
                "detected_content": log_content,
                "time": formatted_hk_time
            }).execute()
            logger.info("💾 Successfully backed up conversation to Supabase")
        except Exception as db_err:
            # Important: print root cause to terminal logs
            logger.error(f"⚠️ Supabase write failed: {db_err}")

        return {"answer": answer}
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"ask_ai error: {error_msg}")
        
        # Handle image safety filter errors
        if "content safety system" in error_msg or "content_policy_violation" in error_msg:
            return {"answer": "Sorry, the image was blocked by the safety filter because it is too dark. Please try in a brighter area."}
            
        # Handle other errors
        return {"answer": "Sorry, I encountered a network error while thinking."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=1)