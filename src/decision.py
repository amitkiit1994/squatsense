"""
Analyze rep metrics and generate report.html + plots.
"""
from __future__ import annotations

import json
import os
from typing import Any


def load_live_metrics(metrics_path: str) -> dict[str, Any]:
    with open(metrics_path) as f:
        return json.load(f)


def run_decision_and_report(
    metrics_path: str,
    keypoints_path: str,
    output_dir: str,
    source: str = "live",
    min_reps_for_fatigue: int = 2,
) -> None:
    """
    Load live_metrics.json, optionally run fatigue analysis if enough reps,
    generate report.html and plots.
    """
    os.makedirs(output_dir, exist_ok=True)
    with open(metrics_path) as f:
        data = json.load(f)
    reps = data.get("reps", [])
    rep_count = data.get("rep_count", len(reps))

    insufficient = rep_count < min_reps_for_fatigue
    if insufficient:
        fatigue_note = "Insufficient reps for fatigue analysis (need at least {}).".format(min_reps_for_fatigue)
        fatigue_analysis = ""
    else:
        fatigue_note = ""
        # Simple fatigue proxy: compare first vs last rep depth (knee flexion) and speed
        if len(reps) >= 2:
            first = reps[0]
            last = reps[-1]
            d0 = first.get("knee_flexion_deg") or 0
            d1 = last.get("knee_flexion_deg") or 0
            s0 = first.get("speed_proxy") or 0
            s1 = last.get("speed_proxy") or 0
            depth_change = (d1 - d0) / (abs(d0) + 1e-6) * 100
            speed_change = (s1 - s0) / (abs(s0) + 1e-6) * 100
            fatigue_analysis = (
                f"First vs last rep: depth change {depth_change:+.1f}%, "
                f"speed change {speed_change:+.1f}%. "
                "Decreasing depth/speed may indicate fatigue."
            )
        else:
            fatigue_analysis = "Only one rep; no fatigue comparison."

    # Build HTML report (same format as offline)
    report_lines = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='utf-8'><title>Squat Report</title></head><body>",
        "<h1>Squat Analysis Report</h1>",
        f"<p><b>Source:</b> {source}</p>",
        f"<p><b>Total reps:</b> {rep_count}</p>",
        f"<p><b>Reps with metrics:</b> {len(reps)}</p>",
    ]
    if fatigue_note:
        report_lines.append(f"<p><b>Note:</b> {fatigue_note}</p>")
    if fatigue_analysis:
        report_lines.append(f"<p><b>Fatigue:</b> {fatigue_analysis}</p>")

    def _pct(n: int, d: int) -> float:
        return (n / d * 100.0) if d > 0 else 0.0

    def _mean(vals: list[float]) -> float | None:
        return sum(vals) / len(vals) if vals else None

    def _cv(vals: list[float]) -> float | None:
        if len(vals) < 2:
            return None
        m = _mean(vals)
        if not m or abs(m) < 1e-6:
            return None
        var = sum((v - m) ** 2 for v in vals) / (len(vals) - 1)
        return (var ** 0.5) / abs(m)

    # User-friendly summary
    if reps:
        depth_ok = sum(1 for r in reps if r.get("depth_ok") is True)
        trunk_ok = sum(1 for r in reps if r.get("trunk_ok") is True)
        balance_ok = sum(1 for r in reps if r.get("balance_ok") is True)
        form_ok = sum(1 for r in reps if r.get("form_ok") is True)
        depth_pct = _pct(depth_ok, len(reps))
        trunk_pct = _pct(trunk_ok, len(reps))
        balance_pct = _pct(balance_ok, len(reps))
        form_pct = _pct(form_ok, len(reps))

        knee_flex = [r.get("knee_flexion_deg") for r in reps if r.get("knee_flexion_deg") is not None]
        speeds = [r.get("speed_proxy") for r in reps if r.get("speed_proxy") is not None]
        durations = [r.get("duration_sec") for r in reps if r.get("duration_sec") is not None]
        depth_avg = _mean(knee_flex)
        speed_avg = _mean(speeds)
        duration_avg = _mean(durations)
        depth_cv = _cv(knee_flex)
        speed_cv = _cv(speeds)

        if form_pct >= 80:
            overall = "Great form overall."
        elif form_pct >= 50:
            overall = "Decent form with a few consistency issues."
        else:
            overall = "Form needs attention; focus on consistency."

        tips = []
        if depth_pct < 70:
            tips.append("Try to go a bit deeper on most reps.")
        if trunk_pct < 70:
            tips.append("Keep your chest up to reduce forward lean.")
        if balance_pct < 70:
            tips.append("Keep your weight centered over mid‑foot.")
        if speed_cv is not None and speed_cv > 0.25:
            tips.append("Aim for a more consistent tempo.")
        if depth_cv is not None and depth_cv > 0.25:
            tips.append("Work on consistent depth rep‑to‑rep.")
        if not tips:
            tips.append("Nice work—keep the same cues next set.")

        report_lines.append("<h2>Quick summary</h2>")
        report_lines.append(f"<p><b>Overall:</b> {overall}</p>")
        report_lines.append(
            "<p><b>Form checks:</b> "
            f"Depth OK {depth_pct:.0f}%, Trunk OK {trunk_pct:.0f}%, "
            f"Balance OK {balance_pct:.0f}%, Overall OK {form_pct:.0f}%.</p>"
        )
        if depth_avg is not None or duration_avg is not None:
            depth_txt = f"{depth_avg:.1f}°" if depth_avg is not None else "--"
            tempo_txt = f"{duration_avg:.2f}s" if duration_avg is not None else "--"
            report_lines.append(
                f"<p><b>Average depth:</b> {depth_txt} | <b>Average rep time:</b> {tempo_txt}</p>"
            )
        if speed_avg is not None:
            report_lines.append(f"<p><b>Average speed:</b> {speed_avg:.2f}</p>")
        report_lines.append("<p><b>Tips:</b> " + " ".join(tips) + "</p>")

    def _fmt(val: Any) -> str:
        if isinstance(val, (int, float)):
            return f"{val:.2f}"
        return "--"

    def _fmt_bool(val: Any) -> str:
        if val is True:
            return "yes"
        if val is False:
            return "no"
        return "--"

    report_lines.append("<h2>Per-rep metrics</h2>")
    report_lines.append("<h3>What these metrics mean</h3>")
    report_lines.append(
        "<ul>"
        "<li><b>Knee flexion (deg)</b>: depth proxy (higher = deeper).</li>"
        "<li><b>Hip angle (deg)</b>: hip joint angle at the bottom position.</li>"
        "<li><b>Trunk angle (deg)</b>: forward lean from vertical (lower = more upright).</li>"
        "<li><b>COM offset</b>: center-of-mass shift relative to foot base (closer to 0 = more centered).</li>"
        "<li><b>Depth/Trunk/Balance/Form OK</b>: simple checks based on calibrated thresholds.</li>"
        "</ul>"
    )
    report_lines.append(
        "<table border='1'><tr>"
        "<th>Rep</th>"
        "<th>Knee flexion (deg)</th>"
        "<th>Depth OK</th>"
        "<th>Hip angle (deg)</th>"
        "<th>Trunk angle (deg)</th>"
        "<th>Trunk OK</th>"
        "<th>COM offset (foot lengths)</th>"
        "<th>Balance OK</th>"
        "<th>Form OK</th>"
        "<th>Speed proxy</th>"
        "<th>Duration (s)</th>"
        "</tr>"
    )
    for r in reps:
        report_lines.append(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
                r.get("rep", ""),
                _fmt(r.get("knee_flexion_deg")),
                _fmt_bool(r.get("depth_ok")),
                _fmt(r.get("hip_angle_deg")),
                _fmt(r.get("trunk_angle_deg")),
                _fmt_bool(r.get("trunk_ok")),
                _fmt(r.get("com_offset_norm")),
                _fmt_bool(r.get("balance_ok")),
                _fmt_bool(r.get("form_ok")),
                _fmt(r.get("speed_proxy")),
                _fmt(r.get("duration_sec")),
            )
        )
    report_lines.append("</table></body></html>")

    report_path = os.path.join(output_dir, "report.html")
    with open(report_path, "w") as f:
        f.write("\n".join(report_lines))

    # Optional: plot depth/speed across reps if we have data
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        if len(reps) >= 1:
            depths = [r.get("knee_flexion_deg") for r in reps if r.get("knee_flexion_deg") is not None]
            speeds = [r.get("speed_proxy") for r in reps if r.get("speed_proxy") is not None]
            if depths:
                plt.figure(figsize=(6, 4))
                plt.plot(range(1, len(depths) + 1), depths, "o-")
                plt.xlabel("Rep")
                plt.ylabel("Knee flexion (deg)")
                plt.title("Depth by rep (knee flexion)")
                plt.savefig(os.path.join(output_dir, "depth_by_rep.png"), dpi=100)
                plt.close()
            if speeds:
                plt.figure(figsize=(6, 4))
                plt.plot(range(1, len(speeds) + 1), speeds, "o-")
                plt.xlabel("Rep")
                plt.ylabel("Speed proxy")
                plt.title("Speed by rep")
                plt.savefig(os.path.join(output_dir, "speed_by_rep.png"), dpi=100)
                plt.close()
    except Exception:
        pass
