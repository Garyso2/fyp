// ================== App-wide Constants ==================
// Centralise all shared magic values here so every layer
// imports from a single source of truth.

// --- BLE / Bluetooth (must match the Pi device firmware) ---
export const BLE_SERVICE_UUID = 'a07498ca-ad5b-474e-940d-16f1fbe7e8cd';
export const BLE_CHAR_UUID    = '51ff12cb-fdf0-4222-800f-b91f37d3d224';

// --- Activity log types (must match values stored by Pi) ---
export const ACTIVITY_TYPES = {
  AI_SCENE_ANALYSIS: 'AI_SCENE_ANALYSIS',
  AI_CHAT:           'AI_CHAT',
  OBSTACLE_WARNING:  'OBSTACLE_WARNING',
  FALL_DETECTION:    'FALL_DETECTION',
};

// --- Page identifiers used by App-level navigation ---
export const PAGES = {
  DASHBOARD:        'dashboard',
  LOGS:             'logs',
  ADD_DEVICE:       'addDevice',
  WIFI_SETUP:       'wifiSetup',
  BLUETOOTH_SETUP:  'bluetoothSetup',
};

// --- LocalStorage key for the persisted user session ---
export const SESSION_KEY = 'app_user_session';
