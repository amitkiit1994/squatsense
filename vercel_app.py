"""
Landing page for squatsense.ai (Vercel). Links to app.squatsense.ai for the full app (Cloudflare Tunnel).
"""
from __future__ import annotations

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse

app = FastAPI(title="SquatSense AI")

APP_URL = "https://app.squatsense.ai"

LANDING_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SquatSense AI — Real-time squat form feedback</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap");
    :root {
      --bg: #07090d;
      --panel: #0f1319;
      --text: #f0f4f8;
      --muted: #94a3b8;
      --accent: #06b6d4;
      --accent-soft: #22d3ee;
      --border: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "DM Sans", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
      text-align: center;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(6, 182, 212, 0.15) 0%, transparent 50%),
        var(--bg);
      pointer-events: none;
      z-index: 0;
    }
    .wrap { position: relative; z-index: 1; max-width: 520px; }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      background: rgba(6, 182, 212, 0.12);
      color: var(--accent-soft);
      border: 1px solid rgba(6, 182, 212, 0.3);
      border-radius: 999px;
      margin-bottom: 24px;
      letter-spacing: 0.02em;
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 16px;
    }
    .tagline {
      color: var(--muted);
      font-size: 1.15rem;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .cta {
      display: inline-block;
      background: linear-gradient(135deg, var(--accent), #0891b2);
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
      padding: 14px 28px;
      border-radius: 12px;
      text-decoration: none;
      box-shadow: 0 4px 20px rgba(6, 182, 212, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(6, 182, 212, 0.4);
    }
    .cta:active { transform: translateY(0); }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--muted);
    }
    .footer strong { color: var(--text); }
    .footer .tag {
      display: inline-block;
      margin-left: 8px;
      padding: 3px 8px;
      border: 1px solid rgba(6, 182, 212, 0.35);
      border-radius: 999px;
      color: var(--accent-soft);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <span class="badge">Real-time Squat Analysis</span>
    <h1>SquatSense AI</h1>
    <p class="tagline">Get instant form feedback on your squats. Upload a video or use live analysis — no coach required.</p>
    <a href="https://app.squatsense.ai" class="cta">Open the app</a>
    <footer class="footer">
      <strong>SquatSense</strong> — simple, private, accessible.
      <span class="tag">Early Access</span>
    </footer>
  </div>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse(LANDING_PAGE)


@app.post("/analyze", response_class=HTMLResponse)
async def analyze(video: UploadFile = File(...)) -> HTMLResponse:
    # Redirect to full app for analysis
    return RedirectResponse(url=f"{APP_URL}/", status_code=302)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
