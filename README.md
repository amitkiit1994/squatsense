# Coachless Squat POC

Squat rep counter and biomechanics metrics from video or **live webcam**, using MediaPipe Pose (CPU-only, macOS-friendly).

## Modes

- **Offline:** process a recorded video file.
- **Live:** real-time webcam with skeleton overlay, rep count, knee flexion/hip-trunk angles, COM balance proxy, speed; generates report on exit.

## Requirements

- Python 3.10+
- macOS (tested; may work on Linux/Windows with a webcam)

## Install

```bash
cd coachless_squat_poc
pip install -r requirements.txt
```

Dependencies: `mediapipe`, `opencv-python`, `numpy`, `matplotlib`, `scipy`, `fastapi`, `uvicorn`, `python-multipart`.

## Usage

**Offline (video file):**
```bash
python run.py --video path/to/video.mp4
```

**Live webcam:**
```bash
python run.py --live --camera 0
```

**Live with recording (save overlayed video):**
```bash
python run.py --live --camera 0 --record
```

Exactly one of `--video` or `--live` must be provided.

Options:
- `--camera N` — camera device id (default: 0)
- `--record` — in live mode, save `outputs/live_recording.mp4` with overlay
- `--output-dir DIR` — output directory (default: `outputs`)

## Web UI (localhost)

Start the service:
```bash
uvicorn web_app:app --reload --host 0.0.0.0 --port 8000
```

Open the UI in your browser:
```
http://localhost:8000
```

Upload a video to generate a report. The web UI also supports recording from
your webcam (beta) and live analysis in the browser. On mobile, the file picker
opens the camera.

Live analysis shows real-time metrics and a skeleton overlay. You can tune FPS
and upload quality from the UI controls to balance latency vs accuracy.

Reports are rendered inline on the homepage after each session (no report
storage for the web UI).

## Live controls

- **q** — end session (saves keypoints, metrics, and generates report)
- **r** — reset session (clear rep buffer and counters)
- **s** — save a snapshot frame to `outputs/`

## Calibration

At the start of a live session, the app auto-calibrates for a short period
(~2 seconds) to establish your baseline standing posture. Rep detection
starts after calibration completes.

## Metrics (report)

Per-rep metrics are biomechanics-based:
- **Knee flexion (deg)** — depth proxy (higher = deeper).
- **Hip angle (deg)** — hip joint angle at the bottom.
- **Trunk angle (deg)** — forward lean from vertical.
- **COM offset (foot lengths)** — center-of-mass projection relative to foot base.
- **Depth OK / Trunk OK / Balance OK / Form OK** — simple flags based on calibrated thresholds.

## Outputs

- **Offline:** `outputs/offline_keypoints.json`, `outputs/offline_metrics.json`, `outputs/report.html`
- **Live (on quit):** `outputs/live_keypoints.json`, `outputs/live_metrics.json`, `outputs/report.html`, optional `outputs/live_recording.mp4` (if `--record`)

If fewer than 2 reps are detected, the report still opens and states: *"Insufficient reps for fatigue analysis."*

---

## macOS: Camera permission

If OpenCV cannot open the camera (e.g. "Cannot open camera 0"):

1. **System Settings → Privacy & Security → Camera** — ensure your terminal (Terminal.app, iTerm, or **Cursor**) is allowed to use the camera.
2. If you run from **Cursor** or VS Code, grant camera access to **Cursor** (or **Code**), not only Terminal.
3. Quit and reopen the app after changing the permission.
4. If another app (Zoom, FaceTime, etc.) is using the camera, close it and try again.

---

## Live demo setup (tips)

- **Angle:** Place the camera to the **side** (about 45° or 90°) so hip and knee movement is visible.
- **Full body:** Keep full body in frame (head to feet) so hip and ankle landmarks are stable.
- **Lighting:** Stable, even lighting; avoid strong backlight.
- **Background:** Plain background helps pose detection.
- **Clothing:** Wear clothes that **contrast** with the background so the body outline is clear.

These improve rep detection and biomechanics metrics (angles, COM/balance).
