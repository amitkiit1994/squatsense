"""
Live webcam pipeline: capture, pose, incremental rep detection, overlay window.
Saves keypoints, metrics, and generates report on exit (q).
"""
from __future__ import annotations

import json
import os
import time
import threading
from typing import Any

import cv2
import numpy as np

from .io_stream import webcam_frames
from .overlay import draw_realtime_overlay
from .pose import create_pose_detector, process_frame
from .reps import IncrementalRepDetector, smooth_keypoints_ema
from .ai_coach import ai_coach_feedback

# Target resize width for faster inference
LIVE_RESIZE_WIDTH = 960
# Frame skip if FPS drops below this
FPS_SKIP_THRESHOLD = 12
# No-pose warning after this many seconds
NO_POSE_WARN_SEC = 2.0
# EMA alpha for keypoint smoothing
SMOOTH_ALPHA = 0.4
AI_MIN_INTERVAL_SEC = 6.0
AI_DISPLAY_SEC = 12.0


def run_live_pipeline(
    camera_id: int = 0,
    target_fps: float = 20,
    record: bool = False,
    output_dir: str = "outputs",
) -> None:
    """
    Run live capture loop. q=quit, r=reset, s=snapshot.
    On quit: save keypoints, metrics, run decision, generate report; optionally save recording.
    """
    os.makedirs(output_dir, exist_ok=True)
    pose = create_pose_detector()
    rep_detector = IncrementalRepDetector(
        window_size=60,
        min_frames_peak_to_trough=5,
        min_frames_trough_to_peak=5,
    )

    keypoints_series: list[Optional[list[tuple[float, float]]]] = []
    fps_actual = target_fps
    prev_keypoints: Optional[list[tuple[float, float]]] = None
    process_every_n = 1
    last_pose_time = time.perf_counter()
    message: Optional[str] = None
    ai_message: Optional[str] = None
    ai_last_time = 0.0
    ai_pending = False
    ai_lock = threading.Lock()
    last_rep_count = 0
    video_writer: Optional[cv2.VideoWriter] = None
    win_name = "Squat Coach (q=quit, r=reset, s=snapshot)"

    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)

    frame_count = 0
    try:
        for frame_bgr, frame_idx, fps_est in webcam_frames(camera_id, target_fps=target_fps):
            fps_actual = fps_est
            if fps_actual < FPS_SKIP_THRESHOLD and process_every_n == 1:
                process_every_n = 2
            elif fps_actual >= 15 and process_every_n == 2:
                process_every_n = 1

            # Resize for inference
            h, w = frame_bgr.shape[:2]
            scale = LIVE_RESIZE_WIDTH / w if w > LIVE_RESIZE_WIDTH else 1.0
            if scale != 1.0:
                new_w = LIVE_RESIZE_WIDTH
                new_h = int(round(h * scale))
                small = cv2.resize(frame_bgr, (new_w, new_h))
            else:
                small = frame_bgr
                new_w, new_h = w, h

            # Process every Nth frame; reuse last keypoints on skipped frames
            run_pose = (frame_count % process_every_n == 0)
            kp_for_buffer: Optional[list[tuple[float, float]]] = None
            if run_pose:
                kp_raw = process_frame(small, pose)
                if kp_raw is not None:
                    last_pose_time = time.perf_counter()
                    kp_orig = (
                        [(x / scale, y / scale) for x, y in kp_raw]
                        if scale != 1.0
                        else list(kp_raw)
                    )
                    kp_smooth = smooth_keypoints_ema(kp_orig, prev_keypoints, SMOOTH_ALPHA)
                    prev_keypoints = kp_smooth
                    kp_for_buffer = kp_smooth
                else:
                    kp_for_buffer = prev_keypoints
            else:
                kp_for_buffer = prev_keypoints

            keypoints_series.append(kp_for_buffer)
            state = rep_detector.push(frame_idx, kp_for_buffer, fps_actual)
            if state["rep_count"] > last_rep_count:
                last_rep_count = state["rep_count"]
                now = time.perf_counter()
                if not ai_pending and (now - ai_last_time) >= AI_MIN_INTERVAL_SEC:
                    reps_snapshot = list(rep_detector.confirmed_reps)
                    ai_pending = True

                    def _ai_worker() -> None:
                        nonlocal ai_message, ai_last_time, ai_pending
                        text = ai_coach_feedback(reps_snapshot, "live")
                        with ai_lock:
                            if text:
                                ai_message = text
                                ai_last_time = time.perf_counter()
                            ai_pending = False

                    threading.Thread(target=_ai_worker, daemon=True).start()

            # No-pose warning
            if time.perf_counter() - last_pose_time > NO_POSE_WARN_SEC:
                message = "Move into frame"
            else:
                message = None

            out_frame = frame_bgr.copy()
            if ai_message and (time.perf_counter() - ai_last_time) > AI_DISPLAY_SEC:
                ai_message = None
            draw_realtime_overlay(
                out_frame,
                prev_keypoints,
                state["rep_count"],
                state.get("knee_flexion_deg"),
                state.get("trunk_angle_deg"),
                state.get("com_offset_norm"),
                state.get("speed_proxy"),
                state.get("status", "Tracking"),
                message,
                ai_message,
            )

            if record and video_writer is None:
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                rec_path = os.path.join(output_dir, "live_recording.mp4")
                video_writer = cv2.VideoWriter(
                    rec_path,
                    fourcc,
                    max(1, int(fps_actual)),
                    (out_frame.shape[1], out_frame.shape[0]),
                )
            if video_writer is not None:
                video_writer.write(out_frame)

            cv2.imshow(win_name, out_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                rep_detector.reset()
                keypoints_series.clear()
                message = None
            if key == ord("s"):
                snap_path = os.path.join(output_dir, f"snapshot_{frame_idx}.jpg")
                cv2.imwrite(snap_path, out_frame)
                message = "Saved snapshot"

            frame_count += 1
    finally:
        cv2.destroyAllWindows()
        if video_writer is not None:
            video_writer.release()

    # Save outputs and generate report
    kp_for_save = []
    for i, kp in enumerate(keypoints_series):
        if kp is None:
            continue
        kp_for_save.append({
            "frame": i,
            "keypoints": [[round(x, 4), round(y, 4)] for x, y in kp],
        })
    keypoints_path = os.path.join(output_dir, "live_keypoints.json")
    with open(keypoints_path, "w") as f:
        json.dump({"frames": kp_for_save, "fps_est": fps_actual}, f, indent=2)

    def _to_json_serializable(obj: Any) -> Any:
        """Convert numpy int64/float64 in rep dicts to native Python types."""
        if isinstance(obj, dict):
            return {k: _to_json_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_to_json_serializable(v) for v in obj]
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        return obj

    metrics_path = os.path.join(output_dir, "live_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(
            {
                "reps": _to_json_serializable(rep_detector.confirmed_reps),
                "rep_count": int(rep_detector.rep_count),
                "fps_est": float(fps_actual),
            },
            f,
            indent=2,
        )

    from .decision import run_decision_and_report

    run_decision_and_report(
        metrics_path=metrics_path,
        keypoints_path=keypoints_path,
        output_dir=output_dir,
        source="live",
        min_reps_for_fatigue=2,
    )
