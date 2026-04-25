"""
GestureListener — detects hand gestures from camera frames using MediaPipe.
Called by vision modules; does NOT open the camera itself.

Trigger: hold up all 5 fingers (open palm) for REQUIRED_FRAMES consecutive
         frames to confirm the gesture and fire a photo action.
"""

import cv2
import numpy as np
import mediapipe as mp
import time


class GestureListener:
    """
    Detects a 'five-finger open palm' gesture from JPEG frames.

    Usage:
        gl = GestureListener()
        ...
        if gl.process_frame(jpeg_bytes):
            # gesture confirmed → trigger photo
    """

    # Consecutive frames that must all show 5 fingers before confirming
    REQUIRED_FRAMES = 10

    # Minimum seconds between two consecutive triggers (debounce)
    GESTURE_COOLDOWN = 5.0

    def __init__(self):
        self._mp_hands = mp.solutions.hands
        self._hands = self._mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5,
        )
        self._five_count = 0
        self._last_trigger_time = 0.0

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _count_extended_fingers(self, hand_landmarks, handedness) -> int:
        """Return the number of extended fingers (0–5) for one hand."""
        lm = hand_landmarks.landmark

        # Thumb — direction depends on which hand it is
        is_right = handedness.classification[0].label == "Right"
        thumb_extended = lm[4].x < lm[3].x if is_right else lm[4].x > lm[3].x

        # Index → Pinky: tip y above PIP y (smaller y = higher in image) means extended
        finger_tips = [8, 12, 16, 20]
        finger_pips = [6, 10, 14, 18]
        fingers_extended = sum(
            1 for tip, pip in zip(finger_tips, finger_pips)
            if lm[tip].y < lm[pip].y
        )

        return int(thumb_extended) + fingers_extended

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_frame(self, jpeg_bytes: bytes) -> bool:
        """
        Feed a raw JPEG frame and check for a sustained 'five-finger' gesture.

        Returns True once REQUIRED_FRAMES consecutive frames all show 5 fingers
        AND GESTURE_COOLDOWN seconds have elapsed since the last trigger.
        Returns False in every other case.

        Args:
            jpeg_bytes: raw JPEG image bytes (e.g. from rpicam-still or cv2.imencode)
        """
        try:
            nparr = np.frombuffer(jpeg_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                self._five_count = 0
                return False

            # Resize to 320×240 for faster MediaPipe inference on Pi
            frame_small = cv2.resize(frame, (320, 240))
            rgb = cv2.cvtColor(frame_small, cv2.COLOR_BGR2RGB)
            results = self._hands.process(rgb)

            if results.multi_hand_landmarks and results.multi_handedness:
                for hand_lm, hand_info in zip(
                    results.multi_hand_landmarks, results.multi_handedness
                ):
                    if self._count_extended_fingers(hand_lm, hand_info) == 5:
                        self._five_count += 1
                        if self._five_count >= self.REQUIRED_FRAMES:
                            now = time.time()
                            if now - self._last_trigger_time > self.GESTURE_COOLDOWN:
                                self._last_trigger_time = now
                                self._five_count = 0
                                print("✋ [GestureListener] Five-finger gesture confirmed → photo trigger")
                                return True
                        return False

            # No hand or fingers ≠ 5
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
