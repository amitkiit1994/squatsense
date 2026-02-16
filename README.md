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
(Use `--port 8001` or any free port if 8000 is in use.)

Open the UI in your browser:
```
http://localhost:8000
```

- **Upload:** Choose a video file; the server returns 202 and a waiting page that polls until the report is ready (avoids timeouts on long analyses). Report is shown inline.
- **Record (browser):** Record a short clip in the browser, then submit for analysis.
- **Live:** Real-time webcam with skeleton overlay, rep count, and angles. **Stand in frame for ~1 second to calibrate**, then do your squats. **Tap "Stop"** to end the session and generate the report (report is sent over the WebSocket and shown on the page). On mobile, the front camera is used when the viewport is narrow.

Live analysis shows real-time metrics and a skeleton overlay. You can tune FPS and quality in the UI to balance latency vs accuracy. Reports are rendered inline; the server does not store reports.

**Terminal diagnostics:** When running live, the server prints `live: session started`, `live: first frame received`, `live: frame 60 (rep_count=…)`, `live: stop received`, `live: report metrics`, and per-rep lines so you can confirm frames and counts in the terminal.

## How to run the full app in production (squatsense.ai)

**Recommended:** Deploy the **full app** (video upload + live analysis) on **Railway** and point **squatsense.ai** there. No 250MB limit; WebSockets and uploads work.

### Option A: Railway (recommended)

1. **Sign up:** [railway.app](https://railway.app) (GitHub login).
2. **New project → Deploy from GitHub:** Connect `amitkiit1994/squatsense` (or your fork). Railway will detect the `Dockerfile` and build the full app.
3. **Settings → Networking:** Enable "Public networking", copy the generated URL (e.g. `https://xxx.up.railway.app`).
4. **Custom domain:** In the same service, **Settings → Domains → Custom domain**, add `squatsense.ai` (and `www.squatsense.ai` if you want). Railway shows the CNAME target; at your registrar, add a CNAME for `squatsense.ai` (or the record Railway shows for apex).
5. **Done.** Open https://squatsense.ai — upload and live analysis work.

No env vars required for basic run. For a **Procfile**-style deploy instead of Docker, Railway can also use Nixpacks; the repo’s `Dockerfile` is the most reliable for this stack.

### Option B: Render

1. **New → Web Service**, connect the repo.
2. **Build:** Docker (uses the repo `Dockerfile`).
3. **Instance:** Free or paid; free tier may sleep after inactivity.
4. **Custom domain:** Settings → Custom domain → add `squatsense.ai` and set the DNS records Render shows.

### Option C: Vercel (slim app only)

The repo is also set up for Vercel. Because of Vercel’s 250MB serverless limit, only the **slim app** (`vercel_app.py`) is deployed there: same UI, but **no** video analysis or live WebSocket.

- Deploy: `vercel --prod` or connect the repo in the Vercel dashboard.
- Use this for a lightweight landing/marketing page, or skip Vercel and use only Railway/Render for the full app at squatsense.ai.

## Live controls

- **q** — end session (saves keypoints, metrics, and generates report)
- **r** — reset session (clear rep buffer and counters)
- **s** — save a snapshot frame to `outputs/`

## Calibration

At the start of a live session, the app auto-calibrates for **~1 second** (10 standing frames) to establish your baseline standing posture. Stand still in frame until calibration completes; rep detection then starts.

## Rep counting and metrics

**All reps are counted** — every completed squat cycle (stand → down → up → stand) is counted regardless of depth or form. Depth and form flags are quality indicators only; they do not exclude reps from the total.

Per-rep metrics (at the bottom of each rep):
- **Knee flexion (deg)** — depth proxy (higher = deeper; ≥90° = parallel or below).
- **Hip angle (deg)** — hip joint angle at the bottom.
- **Trunk angle (deg)** — forward lean from vertical.
- **COM offset (foot lengths)** — center-of-mass projection relative to foot base.
- **Depth OK** — knee flexion ≥ 90° and hip below knee at bottom.
- **Form OK** — Depth OK plus balance and trunk within calibrated thresholds.
- **Trunk OK / Balance OK** — per-frame checks used for Form OK.

If a rep shows a very long duration (e.g. >15 s) or very short (e.g. <0.3 s), the rep boundaries may be off (e.g. long pause at top/bottom); the count can still be correct.

## Outputs

- **Offline (CLI):** `outputs/offline_keypoints.json`, `outputs/offline_metrics.json`, `outputs/report.html`
- **Live CLI (on quit):** `outputs/live_keypoints.json`, `outputs/live_metrics.json`, `outputs/report.html`, optional `outputs/live_recording.mp4` (if `--record`)
- **Web (upload or live):** Report is returned in the UI; the server may write `report_metrics_debug.json` in a temp dir for the run (not kept long-term).

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
