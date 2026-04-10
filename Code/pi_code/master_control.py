import os, time, logging, socket, subprocess, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_DIR = os.path.join(BASE_DIR, "run")
os.makedirs(RUN_DIR, exist_ok=True)
LOG_FILE = f"{RUN_DIR}/system_activity.log"

# 填返你部 Server 嘅 IP
SERVER_IP = "100.125.29.38"
SERVER_PORT = 8000

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

    # ⚠️ 重新將硬件同語音獨立成背景進程 (微服務架構)
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
                # 啟動專心做 AI 嘅 online_vision
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/online_vision.py"])
                current_mode = "ONLINE"
                logger.info("🌐 Switched to ONLINE Vision")

            elif not online and current_mode != "OFFLINE":
                if vision_proc: vision_proc.terminate(); vision_proc.wait()
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/offline_vision.py"])
                current_mode = "OFFLINE"
                logger.info("🔴 Switched to OFFLINE Vision")

            # 看門狗：確保三兄弟冇死機，死咗自動復活
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