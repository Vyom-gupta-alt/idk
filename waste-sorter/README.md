# Waste Sorter - Laptop-Side Python Script

This folder contains only the **Python half** of the Autonomous Household
Waste Sorter. The Arduino/PictoBlox half (ultrasonic sensor, belt motors via
L298N, and the 3-servo sorting arm) is a separate, block-based PictoBlox
project and is **not** part of this folder - it can't be generated as text
code, so it isn't attempted here.

## What `sort_waste.py` does

1. Loads a Teachable Machine image classification model exported as Keras
   (`keras_model.h5` + `labels.txt`).
2. Waits for a `READY` line over serial from the Arduino (sent once the belt
   pauses with an item under the camera dome).
3. Captures a webcam frame and classifies it.
4. If confidence is below 70%, discards the result and captures again
   (up to 5 attempts) instead of guessing.
5. Sends a single digit over serial - `0` for the first label in
   `labels.txt` (biodegradable), `1` for the second (non-biodegradable) -
   newline-terminated.
6. Logs every classification (timestamp, label, confidence, what was sent)
   to `classification_log.csv` for the accuracy and jam-rate tests.

## Setup

1. Export your Teachable Machine model as **Tensorflow -> Keras** and drop
   the resulting `keras_model.h5` and `labels.txt` into a
   `converted_keras/` folder next to `sort_waste.py` (or update `MODEL_PATH`
   / `LABELS_PATH` at the top of the script).
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Open `sort_waste.py` and check the configuration block at the top:
   - `SERIAL_PORT` - the Arduino's port (`COM3` on Windows,
     `/dev/ttyACM0` or similar on Linux/Mac).
   - `BAUD_RATE` - **must match** the baud rate set in the PictoBlox serial
     communication block. `9600` is PictoBlox's usual default, but confirm
     against the actual project rather than assuming.
   - `READY_SIGNAL` - must match the exact text the PictoBlox project sends
     when the belt pauses.
4. Run it:
   ```
   python sort_waste.py
   ```

## Serial protocol (laptop <-> Arduino)

| Direction | Message | Meaning |
|---|---|---|
| Arduino -> laptop | `READY\n` | Belt paused, item is under the camera |
| Laptop -> Arduino | `0\n` | Item classified as biodegradable -> sweep to bin A |
| Laptop -> Arduino | `1\n` | Item classified as non-biodegradable -> sweep to bin B |

On the PictoBlox side, read this with a serial "read until newline" block and
branch on the value to drive the 3 servos.
