from __future__ import annotations

from pathlib import Path
from typing import Optional

import base64
import json
import shutil
import tempfile
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

import cv2
import numpy as np

from run import run_offline
from src.decision import run_decision_and_report
from src.pose import create_pose_detector, process_frame
from src.reps import IncrementalRepDetector, smooth_keypoints_ema


APP_ROOT = Path(__file__).resolve().parent

app = FastAPI(title="Coachless Squat POC")


_DEFAULT_FOOTER = """
    <footer class="footer">
      <div class="footer-inner">
        <strong>SquatSense</strong> — real-time squat form feedback, simple and accessible.
        <span class="tag">Early Access</span>
      </div>
    </footer>
    """


def _page(title: str, body: str, footer: str | None = None) -> str:
    if footer is None:
        footer = _DEFAULT_FOOTER
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap");
      :root {{
        --bg: #07090d;
        --bg-footer: #0a0d12;
        --panel: #0f1319;
        --panel-2: #0c1015;
        --text: #f0f4f8;
        --muted: #94a3b8;
        --accent: #06b6d4;
        --accent-soft: #22d3ee;
        --accent-2: #8b5cf6;
        --border: #1e293b;
        --glow: rgba(6, 182, 212, 0.25);
        --radius: 12px;
        --radius-lg: 16px;
      }}
      * {{ box-sizing: border-box; margin: 0; padding: 0; }}
      html {{
        min-height: 100%;
        overflow-x: hidden;
      }}
      body {{
        font-family: "DM Sans", -apple-system, sans-serif;
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        overflow-x: hidden;
      }}
      body::before {{
        content: "";
        position: fixed;
        inset: 0;
        background:
          radial-gradient(ellipse 80% 50% at 20% -10%, rgba(6, 182, 212, 0.12) 0%, transparent 55%),
          radial-gradient(ellipse 60% 40% at 85% 0%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
          var(--bg);
        pointer-events: none;
        z-index: 0;
      }}
      .wrap {{
        position: relative;
        z-index: 1;
        flex: 1;
        max-width: 720px;
        margin: 0 auto;
        padding: 40px 24px 0;
        width: 100%;
      }}
      .hero {{
        margin-bottom: 32px;
      }}
      .brand {{
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 8px;
      }}
      h1 {{
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text);
      }}
      .badge {{
        font-size: 11px;
        font-weight: 600;
        padding: 5px 10px;
        background: rgba(6, 182, 212, 0.12);
        color: var(--accent-soft);
        border: 1px solid rgba(6, 182, 212, 0.3);
        border-radius: 999px;
        letter-spacing: 0.02em;
      }}
      .hero .muted {{
        font-size: 15px;
        line-height: 1.5;
        color: var(--muted);
      }}
      h3 {{
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 14px;
        color: var(--text);
      }}
      .muted {{ color: var(--muted); font-size: 14px; }}
      .card {{
        border: 1px solid var(--border);
        background: linear-gradient(165deg, var(--panel) 0%, var(--panel-2) 100%);
        padding: 22px;
        border-radius: var(--radius-lg);
        margin-bottom: 20px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
      }}
      .card-inner {{
        display: flex;
        flex-direction: column;
        gap: 14px;
      }}
      .form-row {{
        display: flex;
        flex-direction: column;
        gap: 8px;
      }}
      .form-row label {{
        font-weight: 500;
        font-size: 14px;
        color: var(--text);
      }}
      .btn {{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, var(--accent), #0891b2);
        color: #fff;
        border: 0;
        padding: 12px 20px;
        border-radius: 10px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        box-shadow: 0 2px 12px var(--glow);
      }}
      .btn:hover:not(:disabled) {{
        transform: translateY(-1px);
        box-shadow: 0 4px 20px var(--glow);
      }}
      .btn:active:not(:disabled) {{
        transform: translateY(0);
      }}
      .btn:disabled {{
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }}
      .btn-secondary {{
        background: rgba(30, 41, 59, 0.8);
        color: var(--text);
        border: 1px solid var(--border);
        box-shadow: none;
      }}
      .btn-secondary:hover:not(:disabled) {{
        background: rgba(51, 65, 85, 0.6);
        box-shadow: none;
      }}
      .btn.small {{
        padding: 8px 14px;
        font-size: 13px;
      }}
      .btn-group {{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }}
      .report-card {{
        border: 1px solid var(--border);
        background: var(--panel-2);
        padding: 12px;
        border-radius: var(--radius);
      }}
      .report-title {{
        font-weight: 600;
        margin-bottom: 4px;
      }}
      .report-embed h1 {{ font-size: 20px; margin-top: 0; }}
      .report-embed h2 {{ font-size: 17px; }}
      .report-embed h3 {{ font-size: 15px; }}
      .report-embed table {{
        width: 100%;
        border-collapse: collapse;
      }}
      .report-embed th,
      .report-embed td {{
        border: 1px solid var(--border);
        padding: 8px 10px;
      }}
      .list a {{
        display: inline-block;
        margin-right: 12px;
        color: var(--accent-soft);
        text-decoration: none;
      }}
      code {{
        background: var(--panel-2);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 13px;
      }}
      input[type="file"] {{
        background: var(--panel-2);
        color: var(--text);
        border: 1px solid var(--border);
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 14px;
        width: 100%;
        max-width: 320px;
      }}
      input[type="range"] {{
        accent-color: var(--accent);
        max-width: 120px;
      }}
      .slider-row {{
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
        font-size: 14px;
        color: var(--muted);
      }}
      .footer {{
        margin-top: 32px;
        padding: 24px 0 40px;
        text-align: center;
        font-size: 14px;
        color: var(--muted);
        border-top: 1px solid var(--border);
        width: 100%;
      }}
      .footer-inner {{
        margin: 0 auto;
      }}
      .footer strong {{
        color: var(--text);
        font-weight: 600;
      }}
      .footer .tag {{
        display: inline-block;
        margin-left: 10px;
        padding: 4px 10px;
        border: 1px solid rgba(6, 182, 212, 0.35);
        border-radius: 999px;
        color: var(--accent-soft);
        background: rgba(6, 182, 212, 0.08);
        font-size: 12px;
        font-weight: 500;
      }}
      #reportContainer {{ margin-bottom: 8px; }}
      video {{
        border-radius: 8px;
        border: 1px solid var(--border);
        background: #000;
      }}
      .report-embed table {{
        width: 100%;
        font-size: 14px;
      }}
      .report-embed img {{
        max-width: 100%;
        height: auto;
      }}
      /* Mobile: report stacks vertically, no horizontal scroll */
      @media (max-width: 640px) {{
        .wrap {{
          padding: 20px 16px 0;
        }}
        h1 {{
          font-size: 22px;
        }}
        .card {{
          padding: 16px;
          margin-bottom: 16px;
        }}
        .report-embed {{
          padding: 12px;
        }}
        .report-embed h1 {{ font-size: 18px; margin-top: 0; }}
        .report-embed h2 {{ font-size: 16px; margin-top: 16px; margin-bottom: 8px; }}
        .report-embed h3 {{ font-size: 14px; margin-top: 12px; margin-bottom: 6px; }}
        .report-embed p, .report-embed li {{
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 8px;
        }}
        .report-embed ul {{ padding-left: 20px; margin-bottom: 12px; }}
        .report-embed table, .report-embed thead, .report-embed tbody, .report-embed tr, .report-embed th, .report-embed td {{
          display: block;
        }}
        .report-embed thead {{ display: none; }}
        .report-embed tr {{
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          background: var(--panel-2);
        }}
        .report-embed td {{
          border: none;
          padding: 6px 0;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }}
        .report-embed td::before {{
          content: attr(data-label);
          font-weight: 600;
          color: var(--muted);
          flex-shrink: 0;
        }}
        .report-embed td:first-of-type::before {{
          color: var(--accent-soft);
        }}
        .btn-group {{
          flex-direction: column;
          width: 100%;
        }}
        .btn-group .btn {{
          width: 100%;
        }}
        input[type="file"] {{
          max-width: 100%;
        }}
        .slider-row {{
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }}
        .slider-row input[type="range"] {{
          max-width: 100%;
          width: 100%;
        }}
        .footer {{
          padding: 20px 0 32px;
          font-size: 13px;
        }}
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
    {body}
    {footer}
    </div>
  </body>
</html>"""


def _extract_body(html: str) -> str:
    lower = html.lower()
    if "<body" in lower and "</body>" in lower:
        start = lower.find("<body")
        start = lower.find(">", start) + 1
        end = lower.rfind("</body>")
        return html[start:end].strip()
    return html


def _render_homepage(report_html=None) -> HTMLResponse:
    report_block = ""
    if report_html:
        report_block = (
            "<div class='card report-embed'>"
            "<h3>Latest report</h3>"
            f"{report_html}"
            "</div>"
        )
    body = """
    <header class="hero" id="how-it-works">
      <div class="brand">
        <h1>SquatSense AI</h1>
        <span class="badge">Real-time Squat Analysis</span>
      </div>
      <p class="muted">Upload a video or record with your camera to generate a squat report.</p>
    </header>
    <div id="reportContainer">__REPORT__</div>

    <div class="card" id="upload">
      <h3>Upload a video</h3>
      <div class="card-inner">
        <form action="/analyze" method="post" enctype="multipart/form-data" class="form-row">
          <label for="videoInput">Video file</label>
          <input id="videoInput" type="file" name="video" accept="video/*" capture="environment" required />
          <div class="btn-group" style="margin-top:6px;">
            <button class="btn" type="submit">Analyze video</button>
          </div>
        </form>
        <p class="muted">On mobile, this opens the camera for a quick recording.</p>
        <div class="btn-group">
          <button class="btn btn-secondary" id="showRec">Record in browser</button>
        </div>
        <div id="recBlock" style="display:none;">
          <p class="muted">Record a short clip here, then it will upload automatically.</p>
          <video id="preview" autoplay playsinline muted style="max-width:100%;"></video>
          <div class="btn-group" style="margin-top:12px;">
            <button class="btn" id="startCam">Start camera</button>
            <button class="btn" id="startRec" disabled>Record</button>
            <button class="btn" id="stopRec" disabled>Stop</button>
          </div>
          <p id="status" class="muted" style="margin-top:10px;">Status: idle</p>
        </div>
      </div>
    </div>

    <div class="card" id="live">
      <h3>Live analysis (beta)</h3>
      <div class="card-inner">
        <p class="muted">Real-time feedback in your browser. Works best from a side view.</p>
        <div style="position:relative; max-width:100%; border-radius:8px; overflow:hidden;">
          <video id="livePreview" autoplay playsinline muted style="width:100%;"></video>
          <canvas id="liveOverlay" style="position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none;"></canvas>
        </div>
        <div class="btn-group">
          <button class="btn" id="liveStart">Start live</button>
          <button class="btn btn-secondary" id="liveStop" disabled>Stop</button>
        </div>
        <div class="slider-row">
          <label>FPS: <span id="fpsVal">8</span></label>
          <input id="fpsSlider" type="range" min="2" max="15" value="8" />
          <label>Quality: <span id="qVal">0.6</span></label>
          <input id="qSlider" type="range" min="0.3" max="0.9" value="0.6" step="0.1" />
        </div>
        <p id="liveStatus" class="muted">Live status: idle</p>
      </div>
    </div>

    <script>
      if (location.pathname !== "/") {
        history.replaceState(null, "", "/");
      }
      const recBlock = document.getElementById("recBlock");
      const showRec = document.getElementById("showRec");
      const preview = document.getElementById("preview");
      const startCam = document.getElementById("startCam");
      const startRec = document.getElementById("startRec");
      const stopRec = document.getElementById("stopRec");
      const statusEl = document.getElementById("status");

      let stream = null;
      let recorder = null;
      let chunks = [];

      const setStatus = (msg) => { statusEl.textContent = "Status: " + msg; };

      if (window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        showRec.style.display = "inline-block";
      } else {
        showRec.style.display = "none";
      }

      showRec.onclick = () => {
        recBlock.style.display = "block";
        showRec.disabled = true;
      };

      startCam.onclick = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          preview.srcObject = stream;
          startRec.disabled = false;
          setStatus("camera ready");
        } catch (err) {
          setStatus("camera error: " + err.message);
        }
      };

      startRec.onclick = () => {
        if (!stream) return;
        chunks = [];
        try {
          recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        } catch (err) {
          recorder = new MediaRecorder(stream);
        }
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
          setStatus("uploading...");
          const form = new FormData();
          form.append("video", new File([blob], `recording-${Date.now()}.webm`, { type: blob.type }));
          const res = await fetch("/analyze", { method: "POST", body: form });
          const html = await res.text();
          document.open();
          document.write(html);
          document.close();
        };
        recorder.start();
        startRec.disabled = true;
        stopRec.disabled = false;
        setStatus("recording...");
      };

      stopRec.onclick = () => {
        if (recorder && recorder.state !== "inactive") recorder.stop();
        stopRec.disabled = true;
        startRec.disabled = false;
        setStatus("processing...");
      };

      const livePreview = document.getElementById("livePreview");
      const liveOverlay = document.getElementById("liveOverlay");
      const liveStart = document.getElementById("liveStart");
      const liveStop = document.getElementById("liveStop");
      const liveStatus = document.getElementById("liveStatus");
      const fpsSlider = document.getElementById("fpsSlider");
      const qSlider = document.getElementById("qSlider");
      const fpsVal = document.getElementById("fpsVal");
      const qVal = document.getElementById("qVal");
      const captureCanvas = document.createElement("canvas");
      let liveStream = null;
      let liveWs = null;
      let liveTimer = null;
      let liveFps = 8;
      let liveQuality = 0.6;

      const liveCtx = liveOverlay.getContext("2d");
      const POSE_EDGES = [
        [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],
        [11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
        [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
        [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
        [27,29],[28,30],[29,31],[30,32],[27,31],[28,32],
      ];

      const setLiveStatus = (msg) => { liveStatus.textContent = "Live status: " + msg; };

      const drawOverlay = (data) => {
        const vw = livePreview.videoWidth || 640;
        const vh = livePreview.videoHeight || 480;
        if (liveOverlay.width !== vw || liveOverlay.height !== vh) {
          liveOverlay.width = vw;
          liveOverlay.height = vh;
        }
        const w = liveOverlay.width;
        const h = liveOverlay.height;
        liveCtx.clearRect(0, 0, w, h);
        liveCtx.fillStyle = "rgba(0,0,0,0.5)";
        liveCtx.fillRect(0, 0, w, 90);
        liveCtx.fillStyle = "#fff";
        liveCtx.font = "16px sans-serif";
        const lines = [
          `Rep: ${data.rep_count ?? "--"} | Status: ${data.status ?? "--"}`,
          `Knee flex: ${data.knee_flexion_deg?.toFixed?.(1) ?? "--"} deg`,
          `Trunk: ${data.trunk_angle_deg?.toFixed?.(1) ?? "--"} deg`,
          `COM off: ${data.com_offset_norm?.toFixed?.(2) ?? "--"} | Speed: ${data.speed_proxy?.toFixed?.(2) ?? "--"}`,
        ];
        lines.forEach((line, i) => liveCtx.fillText(line, 12, 24 + i * 20));

        if (Array.isArray(data.keypoints)) {
          liveCtx.strokeStyle = "#00ff7f";
          liveCtx.lineWidth = 2;
          POSE_EDGES.forEach(([a, b]) => {
            const pa = data.keypoints[a];
            const pb = data.keypoints[b];
            if (!pa || !pb) return;
            const ax = pa[0] * w;
            const ay = pa[1] * h;
            const bx = pb[0] * w;
            const by = pb[1] * h;
            liveCtx.beginPath();
            liveCtx.moveTo(ax, ay);
            liveCtx.lineTo(bx, by);
            liveCtx.stroke();
          });
          liveCtx.fillStyle = "#00ff7f";
          data.keypoints.forEach((p) => {
            if (!p) return;
            const x = p[0] * w;
            const y = p[1] * h;
            liveCtx.beginPath();
            liveCtx.arc(x, y, 3, 0, Math.PI * 2);
            liveCtx.fill();
          });
        }
      };

      const sendFrame = () => {
        if (!liveWs || liveWs.readyState !== 1 || !liveStream) return;
        const vw = livePreview.videoWidth;
        const vh = livePreview.videoHeight;
        if (!vw || !vh) return;
        captureCanvas.width = vw;
        captureCanvas.height = vh;
        const cctx = captureCanvas.getContext("2d");
        cctx.drawImage(livePreview, 0, 0, vw, vh);
        const dataUrl = captureCanvas.toDataURL("image/jpeg", liveQuality);
        liveWs.send(JSON.stringify({ image: dataUrl }));
      };

      const restartTimer = () => {
        if (liveTimer) clearInterval(liveTimer);
        const interval = Math.max(60, Math.floor(1000 / liveFps));
        liveTimer = setInterval(sendFrame, interval);
      };

      fpsSlider.oninput = () => {
        liveFps = parseInt(fpsSlider.value, 10);
        fpsVal.textContent = liveFps.toString();
        if (liveWs && liveWs.readyState === 1) restartTimer();
      };
      qSlider.oninput = () => {
        liveQuality = parseFloat(qSlider.value);
        qVal.textContent = liveQuality.toFixed(1);
      };

      liveStart.onclick = async () => {
        try {
          liveStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          livePreview.srcObject = liveStream;
          await livePreview.play();
          const wsProto = location.protocol === "https:" ? "wss" : "ws";
          liveWs = new WebSocket(`${wsProto}://${location.host}/ws/live`);
          liveWs.onopen = () => {
            setLiveStatus("connected");
            restartTimer();
            liveStart.disabled = true;
            liveStop.disabled = false;
          };
          liveWs.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data);
              if (data.type === "report" && data.html) {
                const reportContainer = document.getElementById("reportContainer");
                reportContainer.innerHTML = `<div class="card report-embed"><h3>Latest report</h3>${data.html}</div>`;
                reportContainer.scrollIntoView({ behavior: "smooth" });
                return;
              }
              drawOverlay(data);
            } catch (e) {
              setLiveStatus("parse error");
            }
          };
          liveWs.onclose = () => setLiveStatus("disconnected");
        } catch (err) {
          setLiveStatus("camera error: " + err.message);
        }
      };

      liveStop.onclick = () => {
        if (liveTimer) clearInterval(liveTimer);
        if (liveWs && liveWs.readyState === 1) {
          liveWs.send(JSON.stringify({ type: "stop", save: true }));
        }
        if (liveStream) liveStream.getTracks().forEach(t => t.stop());
        liveStart.disabled = false;
        liveStop.disabled = true;
        setLiveStatus("stopped");
      };
    </script>
    """
    body = body.replace("__REPORT__", report_block)
    return HTMLResponse(_page("SquatSense AI", body))


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return _render_homepage()


@app.post("/analyze")
def analyze(video: UploadFile = File(...)) -> HTMLResponse:
    if not video.filename:
        raise HTTPException(status_code=400, detail="Missing file name.")
    suffix = Path(video.filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        upload_path = tmp / f"upload{suffix}"
        with upload_path.open("wb") as f:
            shutil.copyfileobj(video.file, f)
        try:
            run_offline(str(upload_path), output_dir=str(tmp))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e
        report_path = tmp / "report.html"
        if not report_path.exists():
            raise HTTPException(status_code=500, detail="Report generation failed.")
        report_html = _extract_body(report_path.read_text())
    return _render_homepage(report_html)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/live")
async def live_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    pose = create_pose_detector()
    rep_detector = IncrementalRepDetector()
    prev_keypoints = None
    fps_est = 15.0
    frame_idx = 0
    t_prev = time.perf_counter()
    keypoints_series: list[list[tuple[float, float]] | None] = []
    try:
        while True:
            msg = await websocket.receive_text()
            try:
                payload = json.loads(msg)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "stop":
                save = payload.get("save", True)
                if save:
                    with tempfile.TemporaryDirectory() as tmpdir:
                        tmp = Path(tmpdir)
                        kp_for_save = []
                        for i, kp in enumerate(keypoints_series):
                            if kp is None:
                                continue
                            kp_for_save.append({
                                "frame": i,
                                "keypoints": [[round(x, 4), round(y, 4)] for x, y in kp],
                            })
                        keypoints_path = tmp / "live_keypoints.json"
                        with keypoints_path.open("w") as f:
                            json.dump({"frames": kp_for_save, "fps_est": fps_est}, f, indent=2)

                        metrics_path = tmp / "live_metrics.json"
                        with metrics_path.open("w") as f:
                            json.dump(
                                {
                                    "reps": rep_detector.confirmed_reps,
                                    "rep_count": int(rep_detector.rep_count),
                                    "fps_est": float(fps_est),
                                },
                                f,
                                indent=2,
                            )
                        run_decision_and_report(
                            metrics_path=str(metrics_path),
                            keypoints_path=str(keypoints_path),
                            output_dir=str(tmp),
                            source="live-web",
                            min_reps_for_fatigue=2,
                        )
                        report_path = tmp / "report.html"
                        report_html = _extract_body(report_path.read_text()) if report_path.exists() else ""
                    await websocket.send_text(json.dumps({"type": "report", "html": report_html}))
                await websocket.close()
                return
            image_data = payload.get("image")
            if not image_data:
                continue
            if image_data.startswith("data:"):
                image_data = image_data.split(",", 1)[1]
            try:
                img_bytes = base64.b64decode(image_data)
            except Exception:
                continue
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame_bgr is None:
                continue

            t_now = time.perf_counter()
            dt = t_now - t_prev
            if dt > 0:
                fps_est = 0.9 * fps_est + 0.1 * (1.0 / dt)
            t_prev = t_now

            kp_raw = process_frame(frame_bgr, pose)
            if kp_raw is not None:
                kp_smooth = smooth_keypoints_ema(kp_raw, prev_keypoints, 0.4)
                prev_keypoints = kp_smooth
            else:
                kp_smooth = prev_keypoints

            state = rep_detector.push(frame_idx, kp_smooth, fps_est)
            keypoints_series.append(kp_smooth)
            frame_idx += 1

            keypoints_norm = None
            if kp_smooth is not None and frame_bgr is not None:
                h, w = frame_bgr.shape[:2]
                if w > 0 and h > 0:
                    keypoints_norm = [[p[0] / w, p[1] / h] for p in kp_smooth]
            await websocket.send_text(
                json.dumps(
                    {
                        "rep_count": state.get("rep_count"),
                        "knee_flexion_deg": state.get("knee_flexion_deg"),
                        "trunk_angle_deg": state.get("trunk_angle_deg"),
                        "com_offset_norm": state.get("com_offset_norm"),
                        "speed_proxy": state.get("speed_proxy"),
                        "status": state.get("status"),
                        "fps_est": fps_est,
                        "keypoints": keypoints_norm,
                    }
                )
            )
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("web_app:app", host="0.0.0.0", port=8000, reload=True)
