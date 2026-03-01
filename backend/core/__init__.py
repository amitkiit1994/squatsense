"""
backend.core -- Core modules for SquatSense backend.

Pose estimation, geometry helpers, signal processing, smoothing,
frame metrics, and rep detection.
"""
from .pose import LandmarkIdx, PoseResult, process_frame, create_pose_detector
from .geometry import (
    get_point,
    midpoint,
    angle_deg,
    get_point_3d,
    midpoint_3d,
    angle_deg_3d,
    knee_angle_deg,
    knee_angle_deg_3d,
    trunk_angle_deg,
    trunk_angle_deg_3d,
    hip_below_knee,
    hip_below_knee_3d,
    pose_valid,
    pose_valid_3d,
    com_proxy,
    balance_metrics,
)
from .smoothing import smooth_keypoints_ema, smooth_keypoints_ema_3d
from .signal import median_filter
from .frame_metrics import compute_frame_metrics, compute_baseline
from .rep_detector import IncrementalRepDetector, detect_reps_batch
