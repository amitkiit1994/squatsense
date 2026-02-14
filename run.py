#!/usr/bin/env python3
"""
Squat analysis: offline (video) or live (webcam).
Usage:
  Offline: python run.py --video path/to/video.mp4
  Live:    python run.py --live [--camera 0] [--record]
"""
from __future__ import annotations

import argparse
import os
import sys

# Run from project root so src is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env so OPENAI_API_KEY is available for AI Coach
try:
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv()  # cwd (e.g. coachless_squat_poc or atlas)
    _root = Path(__file__).resolve().parent
    load_dotenv(_root / ".env")
    load_dotenv(_root.parent / ".env")
except ImportError:
    pass

from src.live import run_live_pipeline
from src.pose import create_pose_detector, process_frame
from src.overlay import draw_overlay_batch
from src.io_stream import video_frames
from src.reps import detect_reps_batch
from src.decision import run_decision_and_report


def run_offline(video_path: str, output_dir: str = "outputs") -> None:
    """Process video file: pose -> rep detection -> report."""
    os.makedirs(output_dir, exist_ok=True)
    pose = create_pose_detector()
    keypoints_series = []
    fps = 30.0
    for frame_bgr, frame_idx, fps in video_frames(video_path):
        kp = process_frame(frame_bgr, pose)
        keypoints_series.append(kp)
    reps, hip_y_curve = detect_reps_batch(keypoints_series, fps)
    # Save keypoints and metrics for consistency with live
    import json
    kp_out = []
    for i, kp in enumerate(keypoints_series):
        if kp is None:
            continue
        kp_out.append({"frame": i, "keypoints": [[round(x, 4), round(y, 4)] for x, y in kp]})
    keypoints_path = os.path.join(output_dir, "offline_keypoints.json")
    with open(keypoints_path, "w") as f:
        json.dump({"frames": kp_out, "fps": fps}, f, indent=2)
    metrics_path = os.path.join(output_dir, "offline_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump({"reps": reps, "rep_count": len(reps), "fps": fps}, f, indent=2)
    run_decision_and_report(
        metrics_path=metrics_path,
        keypoints_path=keypoints_path,
        output_dir=output_dir,
        source="offline",
        min_reps_for_fatigue=2,
    )
    print(f"Offline done. Reps: {len(reps)}. Report: {output_dir}/report.html")


def main() -> None:
    ap = argparse.ArgumentParser(description="Squat analysis: offline video or live webcam")
    ap.add_argument("--video", type=str, default=None, help="Path to video file (offline mode)")
    ap.add_argument("--live", action="store_true", help="Use live webcam")
    ap.add_argument("--camera", type=int, default=0, help="Camera device id (default 0)")
    ap.add_argument("--record", action="store_true", help="Save live_recording.mp4 in live mode")
    ap.add_argument("--output-dir", type=str, default="outputs", help="Output directory")
    args = ap.parse_args()

    if args.live and args.video:
        print("Error: provide exactly one of --video or --live", file=sys.stderr)
        sys.exit(1)
    if not args.live and not args.video:
        print("Error: provide --video PATH or --live", file=sys.stderr)
        sys.exit(1)

    if args.live:
        run_live_pipeline(
            camera_id=args.camera,
            target_fps=20,
            record=args.record,
            output_dir=args.output_dir,
        )
    else:
        if not os.path.isfile(args.video):
            print(f"Error: video file not found: {args.video}", file=sys.stderr)
            sys.exit(1)
        run_offline(args.video, output_dir=args.output_dir)


if __name__ == "__main__":
    main()
