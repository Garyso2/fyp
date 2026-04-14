# ================== 🔧 Constants Configuration ==================

# BLE Configuration
SERVICE_UUID = "A07498CA-AD5B-474E-940D-16F1FBE7E8CD"
CHAR_UUID = "51FF12CB-FDF0-4222-800F-B91F37D3D224"

# Operation Timeouts (seconds)
TIMEOUT_LIMIT = 180  # 3 minutes for WiFi connection
BT_PAIR_TIMEOUT = 30
BT_CONNECT_TIMEOUT = 30
BT_SCAN_DURATION = 5  # seconds per scan
BT_DISCONNECT_TIMEOUT = 10
BT_REMOVE_TIMEOUT = 10

# WiFi Configuration
WIFI_CONNECT_TIMEOUT = 60  # seconds
WIFI_RESCAN_INTERVAL = 10  # seconds between rescans
WIFI_MAX_SSIDS = 10  # Max SSIDs to return

# Thread Pool
MAX_SCAN_ITERATIONS = 3  # Bluetooth scan iterations (3 x 5 seconds = 15 seconds total)
