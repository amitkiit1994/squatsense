"""
Optional AI coaching hook using the OpenAI Responses API.
Enabled only when AI_COACH_ENABLED=1 and OPENAI_API_KEY is set.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Optional


def _extract_output_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"].strip()
    out = response.get("output", [])
    parts: list[str] = []
    for item in out:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "message":
            continue
        content = item.get("content", [])
        if not isinstance(content, list):
            continue
        for chunk in content:
            if not isinstance(chunk, dict):
                continue
            if chunk.get("type") in ("output_text", "text") and isinstance(chunk.get("text"), str):
                parts.append(chunk["text"])
    return "\n".join(parts).strip()


def _summarize_reps(reps: list[dict[str, Any]]) -> str:
    if not reps:
        return "No reps detected."
    depth_ok = sum(1 for r in reps if r.get("depth_ok") is True)
    trunk_ok = sum(1 for r in reps if r.get("trunk_ok") is True)
    balance_ok = sum(1 for r in reps if r.get("balance_ok") is True)
    form_ok = sum(1 for r in reps if r.get("form_ok") is True)
    needs_review = sum(1 for r in reps if r.get("needs_review") is True)
    knee_flex = [r.get("knee_flexion_deg") for r in reps if r.get("knee_flexion_deg") is not None]
    durations = [r.get("duration_sec") for r in reps if r.get("duration_sec") is not None]
    speed = [r.get("speed_proxy") for r in reps if r.get("speed_proxy") is not None]
    def _avg(vals: list[float]) -> Optional[float]:
        return (sum(vals) / len(vals)) if vals else None
    return (
        f"Total reps: {len(reps)}. "
        f"Depth OK: {depth_ok}/{len(reps)}. "
        f"Trunk OK: {trunk_ok}/{len(reps)}. "
        f"Balance OK: {balance_ok}/{len(reps)}. "
        f"Form OK: {form_ok}/{len(reps)}. "
        f"Needs review: {needs_review}/{len(reps)}. "
        f"Avg knee flexion: {(_avg(knee_flex) or 0):.1f} deg. "
        f"Avg rep duration: {(_avg(durations) or 0):.2f} s. "
        f"Avg speed proxy: {(_avg(speed) or 0):.2f}."
    )


def ai_coach_feedback(
    reps: list[dict[str, Any]],
    source: str,
    timeout_sec: float = 8.0,
) -> Optional[str]:
    """Return short coaching feedback or None if disabled/unavailable."""
    if os.getenv("AI_COACH_ENABLED", "0") != "1":
        return None
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    model = os.getenv("OPENAI_MODEL", "gpt-4.1")
    summary = _summarize_reps(reps)
    prompt = (
        "You are a concise strength coach. Based on the squat summary, "
        "give 3-5 bullet cues (no more than 2 short sentences per bullet). "
        "If reps need review, mention why in one bullet. "
        "Keep it actionable.\n\n"
        f"Source: {source}\n"
        f"Summary: {summary}"
    )
    body = json.dumps({"model": model, "input": prompt}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = _extract_output_text(data)
        return text or None
    except Exception:
        return None
