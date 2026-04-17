import os, time, logging, socket, subprocess, sys

# --- Import configuration ---
from config import SERVER_IP, SERVER_PORT, RUN_DIR, DEVICE_ID, BASE_DIR

# --- Import Supabase client for battery reporting ---
try:
    from services.supabase_client import supabase
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("Warning: Supabase client not found")

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
    except OSError:
        return False

def notify_mode_change(new_mode):
    if new_mode == "ONLINE":
        print("\n--- SWITCHED TO ONLINE MODE ---\n")
    else:
        print("\n--- SWITCHED TO OFFLINE MODE ---\n")
    try:
        if new_mode == "ONLINE":
            subprocess.run(["beep", "-f", "1000", "-l", "200"], stderr=subprocess.DEVNULL, timeout=1)
            time.sleep(0.2)
            subprocess.run(["beep", "-f", "1000", "-l", "200"], stderr=subprocess.DEVNULL, timeout=1)
        else:
            subprocess.run(["beep", "-f", "500", "-l", "300"], stderr=subprocess.DEVNULL, timeout=1)
    except Exception:
        try:
            text = "Online mode" if new_mode == "ONLINE" else "Offline mode"
            subprocess.run(["espeak", "-v", "en-us", "-s", "150", text],
                           stderr=subprocess.DEVNULL, timeout=2)
        except Exception:
            pass

def get_battery_level():
    for path in [
        '/sys/class/power_supply/battery/capacity',
        '/sys/class/power_supply/BAT0/capacity',
    ]:
        try:
            with open(path, 'r') as f:
                return max(0, min(100, int(f.read().strip())))
        except OSError:
            continue
    return 85  # Mock value when no UPS attached

def main():
    logger = setup_logger()
    logger.info("🚀 Master Control Booting Up...")

    if not os.path.exists(LOG_FILE) or os.path.getsize(LOG_FILE) == 0:
        logger.info("First boot detected. Starting BLE setup...")
        subprocess.run([sys.executable, f"{BASE_DIR}/connectivity/ble_server.py"])
        logger.info("WiFi setup completed.")

    logger.info("Starting hardware monitor and voice listener...")
    hw_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/hardware/safety_hardware.py"])
    voice_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/services/voice_listener.py"])

    current_mode = None
    vision_proc = None
    last_battery_report_time = 0  # Timestamp of last battery report
    BATTERY_REPORT_INTERVAL = 30  # Report battery every 30 seconds
    loop_count = 0  # Counter for status display every 10 loops

    while True:
        try:
            online = is_online()
            current_time = time.time()
            loop_count += 1

            if online and current_mode != "ONLINE":
                if vision_proc:
                    vision_proc.terminate()
                    vision_proc.wait()
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/vision/online_vision.py"])
                current_mode = "ONLINE"
                logger.info("Switched to ONLINE vision")
                notify_mode_change("ONLINE")

            elif not online and current_mode != "OFFLINE":
                if vision_proc:
                    vision_proc.terminate()
                    vision_proc.wait()
                vision_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/vision/offline_vision.py"])
                current_mode = "OFFLINE"
                logger.info("Switched to OFFLINE vision")
                notify_mode_change("OFFLINE")

            # Print status summary every 10 loops (~50 seconds)
            if loop_count % 10 == 0:
                status = "ONLINE" if online else "OFFLINE"
                logger.info(f"[{status}] hw={hw_proc.poll() is None} voice={voice_proc.poll() is None} vision={vision_proc.poll() if vision_proc else 'N/A'}")


            # Report battery level when online
            if online and HAS_SUPABASE and (current_time - last_battery_report_time >= BATTERY_REPORT_INTERVAL):
                battery_level = get_battery_level()
                if supabase.update_device_status(battery_level=battery_level, is_online=True):
                    logger.info(f"Battery reported: {battery_level}%")
                    last_battery_report_time = current_time

            # Watchdog: restart child processes if they die unexpectedly
            if hw_proc.poll() is not None:
                logger.warning("Restarting safety_hardware...")
                hw_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/hardware/safety_hardware.py"])

            if voice_proc.poll() is not None:
                logger.warning("Restarting voice_listener...")
                voice_proc = subprocess.Popen([sys.executable, "-u", f"{BASE_DIR}/services/voice_listener.py"])

            time.sleep(5)
            
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down all processes...")
            if vision_proc: vision_proc.terminate()
            if hw_proc: hw_proc.terminate()
            if voice_proc: voice_proc.terminate()
            break

if __name__ == "__main__": 
    main()