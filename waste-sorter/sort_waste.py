"""
sort_waste.py

Laptop-side control script for the Autonomous Household Waste Sorter.

WHAT THIS SCRIPT DOES (and nothing more):
    1. Loads a Teachable Machine image classification model (Keras .h5 + labels.txt).
    2. Waits for a "ready" signal from the Arduino over serial, which means the
       sorting belt has paused and an item is sitting under the camera dome.
    3. Captures one frame from the webcam and classifies it.
    4. If the model isn't confident enough, it throws the result away and grabs
       another frame instead of guessing.
    5. Sends a single digit ("0" = biodegradable, "1" = non-biodegradable) back
       to the Arduino over serial so it knows which bin to sweep the item into.
    6. Logs every classification to a CSV file for later accuracy/jam-rate testing.

WHAT THIS SCRIPT DOES NOT DO:
    It does not touch the ultrasonic sensor, the belt motors, or the servos.
    All of that lives in the PictoBlox project running on the Arduino. This
    script's only connection to the hardware is the USB serial link.

Run with:
    python sort_waste.py
"""

import csv
import os
import time
from datetime import datetime

import cv2
import numpy as np
import serial
from tensorflow.keras.models import load_model

# ---------------------------------------------------------------------------
# CONFIGURATION - edit these to match your setup
# ---------------------------------------------------------------------------

MODEL_PATH = "converted_keras/keras_model.h5"
LABELS_PATH = "converted_keras/labels.txt"

SERIAL_PORT = "COM3"        # Windows e.g. "COM3", Linux/Mac e.g. "/dev/ttyACM0"

# NOTE: Confirm this against the PictoBlox "Serial Communication" block's baud
# rate setting once the PictoBlox project exists - 9600 is PictoBlox's default,
# but if the project was set up with a different value, this MUST match it or
# the Arduino will read garbage.
BAUD_RATE = 9600

CAMERA_INDEX = 0             # 0 is usually the first/only webcam plugged in

CONFIDENCE_THRESHOLD = 0.70  # below this, we discard the result and retry
MAX_CAPTURE_RETRIES = 5      # how many times to re-capture before giving up

# The exact text the Arduino sends once the belt has paused and the item is
# under the camera. Must match whatever string the PictoBlox serial block
# actually transmits.
READY_SIGNAL = "READY"

LOG_PATH = "classification_log.csv"

# Teachable Machine's standard image classification models expect 224x224 RGB
IMAGE_SIZE = (224, 224)


# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------

def load_labels(labels_path):
    """Read labels.txt (Teachable Machine format: '0 Biodegradable' per line)."""
    labels = []
    with open(labels_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Teachable Machine writes "<index> <name>" - we only need the name.
            parts = line.split(" ", 1)
            labels.append(parts[1] if len(parts) > 1 else parts[0])
    return labels


def open_serial_connection(port, baud_rate):
    """Open the serial link to the Arduino, with a clear error if it fails."""
    try:
        connection = serial.Serial(port, baud_rate, timeout=2)
        time.sleep(2)  # give the Arduino time to reset after the port opens
        print(f"Serial connected on {port} at {baud_rate} baud.")
        return connection
    except serial.SerialException as error:
        raise SystemExit(
            f"Could not open serial port '{port}': {error}\n"
            "Check that the Arduino is plugged in and that no other program "
            "(e.g. the PictoBlox serial monitor) is holding the port open."
        )


def open_camera(camera_index):
    """Open the webcam, with a clear error if it isn't found."""
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise SystemExit(f"Could not open webcam at index {camera_index}.")
    return cap


def ensure_log_file(log_path):
    """Create the CSV log with a header row if it doesn't exist yet."""
    if not os.path.exists(log_path):
        with open(log_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "label", "confidence", "sent_value"])


# ---------------------------------------------------------------------------
# MAIN LOGIC
# ---------------------------------------------------------------------------

def wait_for_ready_signal(connection):
    """Block until the Arduino sends the READY_SIGNAL line, meaning an item
    is paused under the camera and it's safe to capture a frame."""
    print("Waiting for belt-paused signal from Arduino...")
    while True:
        line = connection.readline().decode("utf-8", errors="ignore").strip()
        if line == READY_SIGNAL:
            print("Ready signal received - capturing frame.")
            return


def capture_frame(cap):
    """Grab a single frame from the webcam."""
    success, frame = cap.read()
    if not success:
        raise RuntimeError("Failed to read a frame from the webcam.")
    return frame


def preprocess_frame(frame):
    """Resize/normalize a frame the way Teachable Machine's exported models
    expect: 224x224 RGB, pixel values scaled to [-1, 1]."""
    resized = cv2.resize(frame, IMAGE_SIZE, interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    normalized = (rgb.astype(np.float32) / 127.5) - 1
    return np.expand_dims(normalized, axis=0)


def classify_frame(model, labels, frame):
    """Run the model on one frame and return (label, confidence)."""
    input_data = preprocess_frame(frame)
    predictions = model.predict(input_data, verbose=0)[0]
    best_index = int(np.argmax(predictions))
    return labels[best_index], float(predictions[best_index]), best_index


def send_result(connection, class_index):
    """Send the classification result to the Arduino as a single digit,
    newline-terminated. Retries once if the write fails."""
    message = f"{class_index}\n".encode("utf-8")
    try:
        connection.write(message)
        return True
    except serial.SerialException as error:
        print(f"Serial write failed ({error}), retrying once...")
        time.sleep(0.5)
        try:
            connection.write(message)
            return True
        except serial.SerialException as retry_error:
            print(f"Retry also failed: {retry_error}")
            return False


def log_classification(log_path, label, confidence, sent_value):
    """Append one row to the CSV log for later accuracy/jam-rate analysis."""
    with open(log_path, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            datetime.now().isoformat(timespec="seconds"),
            label,
            f"{confidence:.4f}",
            sent_value,
        ])


def process_one_item(model, labels, cap, connection):
    """Wait for an item, classify it, and send the result. Re-captures (up
    to MAX_CAPTURE_RETRIES times) if confidence is too low, rather than
    sending an unreliable guess."""
    wait_for_ready_signal(connection)

    for attempt in range(1, MAX_CAPTURE_RETRIES + 1):
        frame = capture_frame(cap)
        label, confidence, class_index = classify_frame(model, labels, frame)
        print(f"Attempt {attempt}: {label} ({confidence:.1%})")

        if confidence >= CONFIDENCE_THRESHOLD:
            sent_ok = send_result(connection, class_index)
            sent_value = class_index if sent_ok else "SEND_FAILED"
            log_classification(LOG_PATH, label, confidence, sent_value)
            return

    # Ran out of retries without a confident result - log it but send nothing,
    # so the Arduino doesn't act on a bad guess.
    print("Gave up after low-confidence retries; no result sent.")
    log_classification(LOG_PATH, label, confidence, "DISCARDED_LOW_CONFIDENCE")


def main():
    labels = load_labels(LABELS_PATH)
    print(f"Loaded labels: {labels}")

    model = load_model(MODEL_PATH, compile=False)
    print("Model loaded.")

    ensure_log_file(LOG_PATH)
    connection = open_serial_connection(SERIAL_PORT, BAUD_RATE)
    cap = open_camera(CAMERA_INDEX)

    try:
        print("Ready. Waiting for items (Ctrl+C to stop)...")
        while True:
            process_one_item(model, labels, cap, connection)
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        cap.release()
        connection.close()


if __name__ == "__main__":
    main()
