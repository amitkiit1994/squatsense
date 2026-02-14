# Full SquatSense app (video + live). Use for Railway/Render/Fly.io.
FROM python:3.12-slim

WORKDIR /app

# System deps for OpenCV (headless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway/Render set PORT; default 8000 for local Docker
ENV PORT=8000
EXPOSE 8000

CMD uvicorn web_app:app --host 0.0.0.0 --port $PORT
