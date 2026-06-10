"""
backend.core -- Core modules for SquatSense backend.

Pose estimation, geometry helpers, signal processing, smoothing,
frame metrics, and rep detection.
"""
from .frame_metrics import compute_baseline, compute_frame_metrics
from .geometry import (
    angle_deg,
    angle_deg_3d,
    balance_metrics,
    com_proxy,
    get_point,
    get_point_3d,
    hip_below_knee,
    hip_below_knee_3d,
    knee_angle_deg,
    knee_angle_deg_3d,
    midpoint,
    midpoint_3d,
    pose_valid,
    pose_valid_3d,
    trunk_angle_deg,
    trunk_angle_deg_3d,
)
from .pose import LandmarkIdx, PoseResult, create_pose_detector, process_frame
from .rep_detector import IncrementalRepDetector, detect_reps_batch
from .signal import median_filter
from .smoothing import smooth_keypoints_ema, smooth_keypoints_ema_3d
