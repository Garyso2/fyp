import os, time, logging, socket, subprocess, sys

# --- Import configuration ---
from config import SERVER_IP, SERVER_PORT, RUN_DIR, DEVICE_ID, BASE_DIR

# --- Set log file ---
LOG_FILE = f"{RUN_DIR}/system_activity.log"

def setup_logger():
    logger = logging.getLogger("Master")
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - [%(levelname)s] - %(message)s')
    
    fh = logging.FileHandler(LOG_FILE)
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    ch = logging.StreamHandler()
    ch.setFormatter(formatter)
    logger.addHandler(ch)
    return logger

def is_online():
    try:
        socket.create_connection((SERVER_IP, SERVER_PORT), timeout=2)
        return True
    except: return False

def main():
    logger = setup_logger()
    logger.info("🚀 Master Control Booting Up...")

    if not os.path.exists(LOG_FILE) or os.path.getsize(LOG_FILE) == 0:
        logger.info("📡 First boot detected! Starting BLE setup...")
        subprocess.run([sys.executable, f"{BASE_DIR}/ble_server.py"])
        logger.info("✅ WiFi Setup Completed.")

    # ⚠️ Run hardware and voice listener as independent background processes (microservices architecture)
    logger.info("🛡️ Starting Independent Hardware & Voice Listener...")
    hw_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/safety_hardware.py"])
    voice_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/voice_listener.py"])

    current_mode = None
    vision_proc = None

    while True:
        try:
            online = is_online()

            if online and current_mode != "ONLINE":
                if vision_proc: vision_proc.terminate(); vision_proc.wait()
                # Start online vision focused on AI processing
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/online_vision.py"])
                current_mode = "ONLINE"
                logger.info("🌐 Switched to ONLINE Vision")

            elif not online and current_mode != "OFFLINE":
                if vision_proc: vision_proc.terminate(); vision_proc.wait()
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/offline_vision.py"])
                current_mode = "OFFLINE"
                logger.info("🔴 Switched to OFFLINE Vision")

            # Watchdog: ensure the three processes are alive, restart if dead
            if hw_proc.poll() is not None:
                logger.warning("Restarting safety_hardware...")
                hw_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/safety_hardware.py"])
            
            if voice_proc.poll() is not None:
                logger.warning("Restarting voice_listener...")
                voice_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/voice_listener.py"])

            time.sleep(5)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down all processes...")
            if vision_proc: vision_proc.terminate()
            if hw_proc: hw_proc.terminate()
            if voice_proc: voice_proc.terminate()
            break

if __name__ == "__main__":
    main()