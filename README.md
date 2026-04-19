# VisualGuard — Smart Glasses for the Visually Impaired

A wearable AI vision assistant built on Raspberry Pi 5, with a companion mobile app and a cloud-backed detection server.

---

## System Overview

```
📱 Mobile App  ──────────────────────┐
   (React + Capacitor)               │
                                     ▼
                            ☁️  Supabase (Cloud DB)
                                     ▲
🍓 Raspberry Pi  ──── HTTP ────► 🖥️  Detection Server
   (Smart Glasses)                 (FastAPI + YOLO + OpenAI)
```

| Component | Role |
|-----------|------|
| **Raspberry Pi 5** | Captures camera frames, runs offline YOLO, sends frames to server, plays TTS audio |
| **Detection Server** | Runs YOLOv8 + OpenAI vision, returns scene descriptions & obstacle alerts |
| **Mobile App** | User login, device pairing (BLE/WiFi setup), dashboard, fall-detection notifications |
| **Supabase** | Shared database for users, devices, and activity logs |

---

## Prerequisites

| | Requirement |
|---|---|
| Server machine | Python 3.10+, recommended NVIDIA GPU (CUDA), at least 4 GB RAM |
| Raspberry Pi | Pi 5, Camera Module 3 NoIR Wide, Python 3.10+, speaker/earphone |
| Mobile dev | Node.js 18+, Android Studio **or** Xcode (Mac only for iOS) |
| Shared | Internet access for Supabase (credentials already in config) |

---

## Step 1 — Start the Detection Server

> Run this on a PC/Mac/Linux server that the Pi can reach over the network.

```bash
cd Code/server_code

# Install dependencies (first time only)
pip install fastapi uvicorn ultralytics opencv-python mediapipe \
            openai supabase torch numpy

# Start the server (default port 8000)
uvicorn app:app --host 0.0.0.0 --port 8000
```

Verify it is running by opening `http://<SERVER_IP>:8000/health` in a browser — you should see a JSON health response.

> **Note:** `API_KEY` defaults to `yoloProject2026`. If you change it, update `config.py` on the Pi as well.

---

## Step 2 — Set Up the Raspberry Pi

### 2a. Install dependencies

```bash
cd Code/pi_code

pip install -r requirements.txt
pip install supabase ultralytics gtts bless requests python-dotenv
```

### 2b. Point the Pi at your server

Open `Code/pi_code/config.py` and update:

```python
SERVER_IP = "192.168.x.x"   # ← your server machine's local IP
SERVER_PORT = 8000
```

Everything else (Supabase URL, API key, device ID) is already configured.

### 2c. Run the Pi program

```bash
cd Code/pi_code
python master_control.py
```

The Pi will:
- Check if the server is reachable → **ONLINE mode** (YOLO + AI descriptions via server)
- If not reachable → **OFFLINE mode** (local YOLOv8 on-device)
- Start the BLE server so the mobile app can pair and push WiFi credentials

---

## Step 3 — Set Up the Mobile App

### 3a. Install and run in browser (for quick testing)

```bash
cd Code/app_code
npm install
npm run dev
# Open http://localhost:5173
```

### 3b. Build and deploy to Android

```bash
cd Code/app_code
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Run ▶ (or Build > Generate Signed APK for distribution)
```

### 3c. Build and deploy to iOS (Mac + Xcode required)

```bash
cd Code/app_code
npm run build
npx cap sync ios
npx cap open ios
# In Xcode: select your device and press Run ▶
```

---

## First-Time App Flow

1. **Register** — create a new account on the Login screen
2. **Add Device** — tap "Add Device", turn on Bluetooth, and follow the BLE pairing wizard
3. **WiFi Setup** — the app sends your home WiFi credentials to the Pi over BLE
4. **Dashboard** — once connected, the dashboard shows the Pi's online/offline status and recent activity
5. **Logs** — fall-detection events and obstacle alerts appear here with timestamps
6. **Notifications** — the app polls Supabase and fires a local notification when a fall is detected

---

## Voice Commands (on the Pi)

Speak these commands to control the glasses hands-free:

| Command | Action |
|---------|--------|
| `STOP` | Pause scene description |
| `START` | Resume scene description |
| `DESCRIBE` | Get a detailed description of the current scene |
| `WHAT IS IN FRONT` | Ask the AI what is directly ahead |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Pi stuck in OFFLINE mode | Check `SERVER_IP` in `config.py` matches your server; confirm server is running |
| BLE pairing fails | Ensure Bluetooth is enabled on the phone; restart `master_control.py` |
| App build error (Android) | Run `npx cap sync android` again after `npm run build` |
| No TTS audio on Pi | Install `espeak` (`sudo apt install espeak`) or check speaker connection |
| Supabase auth error | The anon key in `config.py` / `supabaseClient.js` must match your Supabase project |
