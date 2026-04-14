import os, time, logging, socket, subprocess, sys

# --- Import configuration ---
from config import SERVER_IP, SERVER_PORT, RUN_DIR, DEVICE_ID, BASE_DIR

# --- Import Supabase client for battery reporting ---
try:
    from supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("⚠️ Warning: Supabase client not found")

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

def get_battery_level():
    """
    Get device battery level
    Returns battery percentage (0-100)
    For Raspberry Pi: reads from /sys/class/power_supply/ if available
    For testing without battery: returns fixed value
    """
    try:
        # Try to read from system power supply (if UPS is connected)
        with open('/sys/class/power_supply/battery/capacity', 'r') as f:
            level = int(f.read().strip())
            return max(0, min(100, level))  # Clamp between 0-100
    except:
        try:
            # Try alternative path
            with open('/sys/class/power_supply/BAT0/capacity', 'r') as f:
                level = int(f.read().strip())
                return max(0, min(100, level))
        except:
            # Mock battery level for testing (normally would be 85% on Pi 5)
            return 85

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
    last_battery_report_time = 0  # Timestamp of last battery report
    BATTERY_REPORT_INTERVAL = 30  # Report battery every 30 seconds

    while True:
        try:
            online = is_online()
            current_time = time.time()

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

            # Report battery level if WiFi is available
            if online and HAS_SUPABASE and (current_time - last_battery_report_time >= BATTERY_REPORT_INTERVAL):
                battery_level = get_battery_level()
                if supabase.update_device_status(battery_level=battery_level, is_online=True):
                    logger.info(f"📊 Battery reported to Supabase: {battery_level}%")
                    last_battery_report_time = current_time

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