"""
GestureListener — detects hand gestures locally using OpenCV (no MediaPipe needed).

Trigger: hold up all 5 fingers (open palm) for REQUIRED_FRAMES consecutive
         frames to confirm the gesture and fire a photo action.

Method: skin-colour segmentation → largest contour → convex hull → convexity
        defects to count finger gaps (4 gaps = 5 fingers).
"""

import os
# Force OpenCV to use a headless (no-display) backend — prevents a Qt/GTK
# window from popping up when cv2 is imported on a desktop environment.
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "0")

import cv2
import numpy as np
import time


def _count_fingers_opencv(frame_bgr) -> int:
    """
    Returns the number of extended fingers (0-5) detected in the frame
    using skin-colour segmentation and convex hull defect counting.
    """
    # -- 1. Skin colour mask in YCrCb (more robust than HSV for skin) --
    ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
    lower = np.array([0, 133, 77], dtype=np.uint8)
    upper = np.array([255, 173, 127], dtype=np.uint8)
    mask = cv2.inRange(ycrcb, lower, upper)

    # Morphological clean-up
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=2)
    mask = cv2.dilate(mask, kernel, iterations=1)

    # -- 2. Find the largest contour (the hand) --
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0
    hand = max(contours, key=cv2.contourArea)

    # Require a minimum hand area (filters out small noise)
    if cv2.contourArea(hand) < 3000:
        return 0

    # -- 3. Convex hull + convexity defects --
    hull_idx = cv2.convexHull(hand, returnPoints=False)
    if hull_idx is None or len(hull_idx) < 3:
        return 0
    try:
        defects = cv2.convexityDefects(hand, hull_idx)
    except cv2.error:
        return 0
    if defects is None:
        return 0

    # Count defects whose depth exceeds a threshold — each gap between fingers
    # is one defect, so 4 deep gaps → 5 fingers.
    finger_gaps = 0
    for i in range(defects.shape[0]):
        s, e, f, depth = defects[i, 0]
        depth_val = depth / 256.0
        if depth_val > 15:          # pixels; tune if needed
            start  = tuple(hand[s][0])
            end    = tuple(hand[e][0])
            far    = tuple(hand[f][0])
            # Angle at the defect point — fingers make acute angles
            a = np.linalg.norm(np.array(end)   - np.array(far))
            b = np.linalg.norm(np.array(start) - np.array(far))
            c = np.linalg.norm(np.array(start) - np.array(end))
            denom = 2 * a * b
            if denom == 0:
                continue
            angle = np.degrees(np.arccos(np.clip((a**2 + b**2 - c**2) / denom, -1, 1)))
            if angle < 90:
                finger_gaps += 1

    # Map gaps → fingers (0 gaps can still be 1 fist or 1 finger)
    return min(finger_gaps + 1, 5) if finger_gaps > 0 else 0


class GestureListener:
    """
    Detects a 'five-finger open palm' gesture from JPEG frames using OpenCV only.

    Usage:
        gl = GestureListener()
        if gl.process_frame(jpeg_bytes):
            # gesture confirmed → trigger photo
    """

    # Consecutive frames that must all show 5 fingers before confirming
    REQUIRED_FRAMES = 10

    # Minimum seconds between two consecutive triggers (debounce)
    GESTURE_COOLDOWN = 5.0

    def __init__(self):
        self._five_count = 0
        self._last_trigger_time = 0.0
        print("✅ [GestureListener] Local OpenCV gesture detection active.")

    def process_frame(self, jpeg_bytes: bytes) -> bool:
        """
        Feed a raw JPEG frame and check for a sustained 'five-finger' gesture.

        Returns True once REQUIRED_FRAMES consecutive frames all show 5 fingers
        AND GESTURE_COOLDOWN seconds have elapsed since the last trigger.
        Returns False in every other case.
        """
        try:
            nparr = np.frombuffer(jpeg_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                self._five_count = 0
                return False

            # Resize to 320×240 for speed on Pi
            frame_small = cv2.resize(frame, (320, 240))
            fingers = _count_fingers_opencv(frame_small)

            if fingers == 5:
                self._five_count += 1
                if self._five_count >= self.REQUIRED_FRAMES:
                    now = time.time()
                    if now - self._last_trigger_time > self.GESTURE_COOLDOWN:
                        self._last_trigger_time = now
                        self._five_count = 0
                        print("✋ [GestureListener] Five-finger gesture confirmed → photo trigger")
                        return True
            else:
                self._five_count = 0

            return False

        except Exception as e:
            print(f"⚠️ [GestureListener] Frame processing error: {e}")
            self._five_count = 0
            return False

    def reset(self):
        """Reset internal counters (call when leaving a state that uses this listener)."""
        self._five_count = 0


# ------------------------------------------------------------------
# Standalone smoke-test (uses a live USB/Pi camera)
# ------------------------------------------------------------------
if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Cannot open camera")
        sys.exit(1)

    listener = GestureListener()
    print("✋ Show all 5 fingers to the camera to trigger. Press Ctrl+C to exit.")
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                continue
            _, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if listener.process_frame(jpeg.tobytes()):
                print("🔔 Photo trigger fired!")
            time.sleep(0.05)
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
