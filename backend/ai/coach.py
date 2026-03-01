"""
Extended AI coaching module with multi-provider LLM support (OpenAI + Anthropic).

Enabled only when AI_COACH_ENABLED=1 and at least one API key is set.
Provides structured coaching feedback: cues, corrective drills, and recovery
suggestions based on session data including composite scores, fatigue markers,
and per-rep risk analysis.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.request
from typing import Any, Optional

logger = logging.getLogger("squatsense.ai_coach")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_avg(vals: list[float | int]) -> Optional[float]:
    """Return the mean of *vals* or None if the list is empty."""
    numeric = [v for v in vals if v is not None]
    if not numeric:
        return None
    return sum(numeric) / len(numeric)


def _pct(count: int, total: int) -> str:
    """Format *count*/*total* as a percentage string like '8/10 (80%)'."""
    if total == 0:
        return "0/0 (0%)"
    return f"{count}/{total} ({100 * count // total}%)"


def _collect_risk_markers(reps: list[dict[str, Any]]) -> dict[str, int]:
    """Aggregate risk-marker flags across all reps.

    Each rep may carry a ``risk_markers`` dict (keys are marker names,
    values are truthy when the marker fired) or a ``flags`` list/dict.
    When neither is present, markers are derived from boolean flags
    (``depth_ok``, ``form_ok``, ``balance_ok``, ``trunk_ok``).
    Returns ``{marker_name: count_of_reps_with_marker}``.
    """
    counts: dict[str, int] = {}
    for rep in reps:
        has_explicit = False

        # Structured risk_markers dict  (e.g. {"knee_valgus": True})
        rm = rep.get("risk_markers")
        if isinstance(rm, dict) and rm:
            has_explicit = True
            for key, val in rm.items():
                if val:
                    counts[key] = counts.get(key, 0) + 1

        # flags may be a list of strings or a dict
        flags = rep.get("flags")
        if isinstance(flags, list) and flags:
            has_explicit = True
            for flag in flags:
                if isinstance(flag, str) and flag:
                    counts[flag] = counts.get(flag, 0) + 1
        elif isinstance(flags, dict) and flags:
            has_explicit = True
            for key, val in flags.items():
                if val:
                    counts[key] = counts.get(key, 0) + 1

        # Derive markers from boolean flags when no explicit markers exist
        if not has_explicit:
            if rep.get("depth_ok") is False:
                counts["shallow_depth"] = counts.get("shallow_depth", 0) + 1
            if rep.get("balance_ok") is False:
                counts["balance_fail"] = counts.get("balance_fail", 0) + 1
            if rep.get("trunk_ok") is False:
                counts["excessive_forward_lean"] = counts.get("excessive_forward_lean", 0) + 1
            if rep.get("form_ok") is False:
                counts["lumbar_rounding"] = counts.get("lumbar_rounding", 0) + 1

    return counts


# ---------------------------------------------------------------------------
# Session summary builder
# ---------------------------------------------------------------------------

def _summarize_session(
    exercise_type: str,
    reps: list[dict[str, Any]],
    sets: list[dict[str, Any]],
    fatigue_index: float | None,
    fatigue_risk: str | None,
    user_context: dict[str, Any] | None = None,
) -> str:
    """Create a rich text summary of the training session for the LLM.

    Includes exercise type, totals, per-set form scores, sub-score breakdown,
    fatigue data, risk markers, and trending information (depth / stability /
    symmetry / tempo across the session).

    When *user_context* is provided, includes athlete profile information
    (experience level, goals, injury history) so the LLM can personalise
    its coaching.
    """
    lines: list[str] = []

    # --- Athlete profile ---
    if user_context:
        profile_parts: list[str] = []
        if user_context.get("experience_level"):
            profile_parts.append(f"Experience: {user_context['experience_level']}")
        if user_context.get("goal"):
            profile_parts.append(f"Goal: {user_context['goal']}")
        injuries = user_context.get("injury_history")
        if injuries:
            if isinstance(injuries, list) and injuries:
                injury_strs = []
                for inj in injuries:
                    if isinstance(inj, dict):
                        injury_strs.append(
                            f"{inj.get('area', 'unknown')} ({inj.get('severity', 'unknown')} severity)"
                        )
                    elif isinstance(inj, str):
                        injury_strs.append(inj)
                if injury_strs:
                    profile_parts.append(f"Injury history: {', '.join(injury_strs)}")
            elif isinstance(injuries, str):
                profile_parts.append(f"Injury history: {injuries}")
        if profile_parts:
            lines.append("--- ATHLETE PROFILE ---")
            lines.extend(profile_parts)
            lines.append("")

    # --- Header ---
    total_reps = len(reps)
    total_sets = len(sets)
    lines.append(f"Exercise: {exercise_type}")
    lines.append(f"Total reps: {total_reps}  |  Total sets: {total_sets}")

    # --- Boolean flag roll-ups ---
    if total_reps:
        depth_ok = sum(1 for r in reps if r.get("depth_ok") is True)
        trunk_ok = sum(1 for r in reps if r.get("trunk_ok") is True)
        balance_ok = sum(1 for r in reps if r.get("balance_ok") is True)
        form_ok = sum(1 for r in reps if r.get("form_ok") is True)
        needs_review = sum(1 for r in reps if r.get("needs_review") is True)
        lines.append(
            f"Depth OK: {_pct(depth_ok, total_reps)}  |  "
            f"Trunk OK: {_pct(trunk_ok, total_reps)}  |  "
            f"Balance OK: {_pct(balance_ok, total_reps)}  |  "
            f"Form OK: {_pct(form_ok, total_reps)}"
        )
        if needs_review:
            lines.append(f"Reps flagged for review: {needs_review}/{total_reps}")

    # --- Composite score ---
    composite_vals = [r.get("composite_score") for r in reps if r.get("composite_score") is not None]
    avg_composite = _safe_avg(composite_vals)
    if avg_composite is not None:
        lines.append(f"Avg composite score: {avg_composite:.1f}")

    # --- Sub-score breakdown ---
    sub_scores = {
        "depth_score": [],
        "stability_score": [],
        "symmetry_score": [],
        "tempo_score": [],
        "rom_score": [],
    }
    for rep in reps:
        for key in sub_scores:
            val = rep.get(key)
            if val is not None:
                sub_scores[key].append(val)

    sub_avgs: list[str] = []
    for key, vals in sub_scores.items():
        avg = _safe_avg(vals)
        if avg is not None:
            label = key.replace("_score", "").capitalize()
            sub_avgs.append(f"{label}: {avg:.1f}")
    if sub_avgs:
        lines.append("Sub-score averages -- " + "  |  ".join(sub_avgs))

    # --- Angle / biomechanics averages ---
    angle_keys = [
        ("primary_angle_deg", "Primary angle"),
        ("secondary_angle_deg", "Secondary angle"),
        ("trunk_angle_deg", "Trunk angle"),
        ("knee_flexion_deg", "Knee flexion"),
    ]
    angle_parts: list[str] = []
    for key, label in angle_keys:
        avg = _safe_avg([r.get(key) for r in reps if r.get(key) is not None])
        if avg is not None:
            angle_parts.append(f"{label}: {avg:.1f} deg")
    if angle_parts:
        lines.append("Avg angles -- " + "  |  ".join(angle_parts))

    duration_vals = [r.get("duration_sec") or (r.get("duration_ms", 0) / 1000.0 if r.get("duration_ms") else None) for r in reps]
    duration_vals = [d for d in duration_vals if d is not None and d > 0]
    avg_dur = _safe_avg(duration_vals)
    if avg_dur is not None:
        lines.append(f"Avg rep duration: {avg_dur:.2f} s")

    speed_vals = [r.get("speed_proxy") for r in reps if r.get("speed_proxy") is not None]
    avg_speed = _safe_avg(speed_vals)
    if avg_speed is not None:
        lines.append(f"Avg speed proxy: {avg_speed:.2f}")

    # --- Per-set summaries ---
    if sets:
        set_lines: list[str] = []
        for s in sets:
            set_num = s.get("set_number", "?")
            actual = s.get("actual_reps", "?")
            fscore = s.get("avg_form_score")
            fi = s.get("fatigue_index")
            fr = s.get("fatigue_risk")
            parts = [f"Set {set_num}: {actual} reps"]
            if fscore is not None:
                parts.append(f"form={fscore:.1f}")
            if fi is not None:
                parts.append(f"fatigue_idx={fi:.2f}")
            if fr:
                parts.append(f"fatigue_risk={fr}")
            depth_flag = s.get("depth_ok")
            stab_flag = s.get("stability_ok")
            tempo_flag = s.get("tempo_ok")
            flag_parts: list[str] = []
            if depth_flag is not None:
                flag_parts.append(f"depth={'OK' if depth_flag else 'FAIL'}")
            if stab_flag is not None:
                flag_parts.append(f"stability={'OK' if stab_flag else 'FAIL'}")
            if tempo_flag is not None:
                flag_parts.append(f"tempo={'OK' if tempo_flag else 'FAIL'}")
            if flag_parts:
                parts.append(" ".join(flag_parts))
            set_lines.append("  " + ", ".join(parts))
        lines.append("Per-set breakdown:")
        lines.extend(set_lines)

    # --- Sub-score trends (first half vs second half) ---
    if total_reps >= 4:
        mid = total_reps // 2
        first_half = reps[:mid]
        second_half = reps[mid:]
        trend_parts: list[str] = []
        for key, label in [
            ("depth_score", "Depth"),
            ("stability_score", "Stability"),
            ("symmetry_score", "Symmetry"),
            ("tempo_score", "Tempo"),
            ("composite_score", "Composite"),
        ]:
            avg_first = _safe_avg([r.get(key) for r in first_half if r.get(key) is not None])
            avg_second = _safe_avg([r.get(key) for r in second_half if r.get(key) is not None])
            if avg_first is not None and avg_second is not None:
                delta = avg_second - avg_first
                direction = "improved" if delta > 0 else ("declined" if delta < 0 else "stable")
                trend_parts.append(f"{label}: {direction} ({delta:+.1f})")
        if trend_parts:
            lines.append("Trends (first half -> second half): " + "  |  ".join(trend_parts))

    # --- Fatigue ---
    if fatigue_index is not None:
        lines.append(f"Session fatigue index: {fatigue_index:.2f}")
    if fatigue_risk:
        lines.append(f"Fatigue risk level: {fatigue_risk}")

    # --- Risk markers ---
    risk_counts = _collect_risk_markers(reps)
    if risk_counts:
        marker_strs = [f"{k} ({v} reps)" for k, v in sorted(risk_counts.items(), key=lambda x: -x[1])]
        lines.append("Risk markers detected: " + ", ".join(marker_strs))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_RESPONSE_SCHEMA = """\
Respond ONLY with a JSON object (no markdown fences, no extra text) matching this schema:
{
  "coaching_cues": ["<string>", ...],       // 3-5 short bullet cues (max 2 sentences each)
  "corrective_drill": {
    "name": "<drill name>",
    "description": "<1-2 sentence description>"
  },
  "recovery_suggestion": "<1-2 sentence recovery tip>"
}"""


def _build_prompt(
    summary: str,
    exercise_type: str,
    previous_coaching: list[dict[str, Any]] | None = None,
) -> str:
    """Build the full coaching prompt sent to the LLM.

    When *previous_coaching* is provided (list of past coaching dicts with
    ``coaching_cues`` and ``corrective_drill``), the prompt instructs the
    LLM to avoid repeating the same drills and cues.
    """
    system_instruction = (
        f"You are a concise strength and conditioning coach specializing in "
        f"{exercise_type.replace('_', ' ')}. "
        "Analyze the training session data below and provide actionable feedback."
    )

    parts = [system_instruction, ""]

    # Include previous coaching so the LLM can avoid repetition
    if previous_coaching:
        parts.append("--- PREVIOUS COACHING (do NOT repeat these) ---")
        for i, prev in enumerate(previous_coaching, 1):
            drill = prev.get("corrective_drill", {})
            drill_name = drill.get("name", "unknown") if isinstance(drill, dict) else "unknown"
            cues = prev.get("coaching_cues", [])
            cue_str = "; ".join(cues[:3]) if isinstance(cues, list) else ""
            parts.append(f"Session {i}: Drill='{drill_name}' | Cues: {cue_str}")
        parts.append("--- END PREVIOUS ---")
        parts.append(
            "IMPORTANT: Recommend a DIFFERENT corrective drill and vary your "
            "coaching cues from the previous sessions listed above. The athlete "
            "needs fresh, progressive guidance — not the same advice repeated."
        )
        parts.append("")

    parts.append(f"--- SESSION DATA ---\n{summary}\n--- END ---")
    parts.append("")
    parts.append(_RESPONSE_SCHEMA)

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# LLM provider calls
# ---------------------------------------------------------------------------

def _extract_openai_output_text(response: dict[str, Any]) -> str:
    """Extract generated text from an OpenAI Responses API response.

    Handles both the ``output_text`` shortcut and the nested
    ``output[].content[].text`` structure.
    """
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


def _call_openai(
    prompt: str, api_key: str, model: str, timeout: float
) -> Optional[str]:
    """Call the OpenAI Responses API and return the raw text response.

    Uses ``urllib.request`` so that no third-party packages are required.
    Returns ``None`` on any failure (network, auth, parsing).
    """
    logger.info("Calling OpenAI Responses API: model=%s, timeout=%.1f", model, timeout)
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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = _extract_openai_output_text(data)
        if text:
            logger.info("OpenAI returned text (%d chars)", len(text))
        else:
            logger.warning("OpenAI returned empty/unparseable response: %s", str(data)[:500])
        return text or None
    except urllib.error.HTTPError as e:
        logger.warning("OpenAI HTTP error %d: %s", e.code, e.read().decode("utf-8", errors="replace")[:300])
        return None
    except Exception:
        logger.exception("OpenAI call failed")
        return None


def _call_anthropic(
    prompt: str, api_key: str, timeout: float
) -> Optional[str]:
    """Call the Anthropic Messages API and return the raw text response.

    POST to ``https://api.anthropic.com/v1/messages``
    Required headers: ``x-api-key``, ``anthropic-version``, ``content-type``.
    Returns ``None`` on any failure.
    """
    logger.info("Calling Anthropic Messages API: timeout=%.1f", timeout)
    body = json.dumps(
        {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 500,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        # Anthropic response shape: {"content": [{"type": "text", "text": "..."}], ...}
        content = data.get("content", [])
        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, dict) and isinstance(first.get("text"), str):
                text = first["text"].strip()
                if text:
                    logger.info("Anthropic returned text (%d chars)", len(text))
                    return text
        logger.warning("Anthropic returned empty/unparseable response: %s", str(data)[:500])
        return None
    except urllib.error.HTTPError as e:
        logger.warning("Anthropic HTTP error %d: %s", e.code, e.read().decode("utf-8", errors="replace")[:300])
        return None
    except Exception:
        logger.exception("Anthropic call failed")
        return None


# ---------------------------------------------------------------------------
# Helpers for JSON extraction from LLM output
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> Optional[dict]:
    """Try to parse *text* as JSON.

    If the LLM wrapped the JSON in markdown fences (```json ... ```) or
    included leading/trailing prose, attempt to extract the JSON object.
    Returns ``None`` if extraction fails.
    """
    if not text:
        return None

    # Fast path: direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown fences
    stripped = text.strip()
    if stripped.startswith("```"):
        # Remove opening fence (```json or ```)
        first_nl = stripped.find("\n")
        if first_nl != -1:
            stripped = stripped[first_nl + 1 :]
        if stripped.endswith("```"):
            stripped = stripped[: -3].rstrip()
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # Try to find the first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return None


def _validate_coaching_response(parsed: dict) -> Optional[dict]:
    """Validate and normalise the parsed LLM response.

    Ensures the expected keys exist with proper types.  Returns a cleaned
    dict or ``None`` if the structure is invalid.
    """
    cues = parsed.get("coaching_cues")
    if not isinstance(cues, list) or not cues:
        return None
    # Ensure each cue is a string; drop empties
    cues = [str(c).strip() for c in cues if c]
    if not cues:
        return None
    # Trim to at most 5
    cues = cues[:5]

    drill = parsed.get("corrective_drill")
    if not isinstance(drill, dict):
        drill = {"name": "General mobility", "description": "Perform a 5-minute general mobility routine targeting the worked muscle groups."}
    else:
        drill = {
            "name": str(drill.get("name", "General mobility")).strip(),
            "description": str(drill.get("description", "")).strip(),
        }

    recovery = parsed.get("recovery_suggestion")
    if not isinstance(recovery, str) or not recovery.strip():
        recovery = "Allow 48 hours before training the same movement pattern again. Prioritise sleep and hydration."

    return {
        "coaching_cues": cues,
        "corrective_drill": drill,
        "recovery_suggestion": recovery.strip(),
    }


# ---------------------------------------------------------------------------
# Public API -- LLM-powered coaching
# ---------------------------------------------------------------------------

async def ai_coach_feedback(
    exercise_type: str,
    reps: list[dict[str, Any]],
    sets: list[dict[str, Any]] | None = None,
    fatigue_index: float | None = None,
    fatigue_risk: str | None = None,
    source: str = "live-web",
    timeout_sec: float = 10.0,
    user_context: dict[str, Any] | None = None,
    previous_coaching: list[dict[str, Any]] | None = None,
) -> Optional[dict]:
    """Return structured coaching feedback or ``None`` if disabled / unavailable.

    Tries OpenAI first (if ``OPENAI_API_KEY`` is set), then falls back to
    Anthropic (if ``ANTHROPIC_API_KEY`` is set).  Both providers are
    optional; if neither key is present the function returns ``None``.

    The ``AI_COACH_ENABLED`` env var must be set to ``"1"`` to activate.

    The blocking HTTP calls to LLM providers are run in a thread pool via
    ``asyncio.to_thread`` so they do not block the async event loop.

    Parameters
    ----------
    user_context:
        Optional dict with ``experience_level``, ``goal``, ``injury_history``
        from the user profile.  When provided, the LLM prompt includes
        personalised context for more relevant coaching.

    Returns
    -------
    dict or None
        ``{coaching_cues, corrective_drill, recovery_suggestion, provider}``
        or ``None`` when the feature is disabled or all providers fail.
    """
    from backend.config import settings as _settings

    if not _settings.AI_COACH_ENABLED:
        logger.info("AI coach disabled (AI_COACH_ENABLED=%s)", _settings.AI_COACH_ENABLED)
        return None

    logger.info("AI coach enabled, generating feedback for %s (%d reps)", exercise_type, len(reps))
    summary = _summarize_session(
        exercise_type, reps, sets or [], fatigue_index, fatigue_risk,
        user_context=user_context,
    )
    prompt = _build_prompt(summary, exercise_type, previous_coaching=previous_coaching)

    # --- Try OpenAI first ---
    openai_key = _settings.OPENAI_API_KEY
    if openai_key:
        raw = await asyncio.to_thread(
            _call_openai,
            prompt,
            openai_key,
            _settings.OPENAI_MODEL,
            timeout_sec,
        )
        if raw:
            parsed = _extract_json(raw)
            if parsed:
                validated = _validate_coaching_response(parsed)
                if validated:
                    validated["provider"] = "openai"
                    logger.info("AI coach: using OpenAI response")
                    return validated
                else:
                    logger.warning("OpenAI response failed validation: %s", str(parsed)[:300])
            else:
                logger.warning("OpenAI response not valid JSON: %s", raw[:300])
        else:
            logger.warning("OpenAI returned no response")
    else:
        logger.info("AI coach: no OPENAI_API_KEY set, skipping OpenAI")

    # --- Fallback to Anthropic ---
    anthropic_key = _settings.ANTHROPIC_API_KEY
    if anthropic_key:
        raw = await asyncio.to_thread(
            _call_anthropic, prompt, anthropic_key, timeout_sec,
        )
        if raw:
            parsed = _extract_json(raw)
            if parsed:
                validated = _validate_coaching_response(parsed)
                if validated:
                    validated["provider"] = "anthropic"
                    logger.info("AI coach: using Anthropic response")
                    return validated
                else:
                    logger.warning("Anthropic response failed validation: %s", str(parsed)[:300])
            else:
                logger.warning("Anthropic response not valid JSON: %s", raw[:300])
        else:
            logger.warning("Anthropic returned no response")
    else:
        logger.info("AI coach: no ANTHROPIC_API_KEY set, skipping Anthropic")

    logger.warning("AI coach: all providers failed, returning None (will use static fallback)")
    return None


# ---------------------------------------------------------------------------
# Public API -- Static corrective-drill lookup (no LLM needed)
# ---------------------------------------------------------------------------

# Master drill database keyed by risk-marker name.  Each entry is a list
# so we can offer variety across sessions.
_DRILL_DATABASE: dict[str, list[dict[str, str]]] = {
    # --- Lower-body / squat-family markers ---
    "knee_valgus": [
        {
            "name": "Banded Squats",
            "description": (
                "Place a light resistance band just above your knees. "
                "Perform bodyweight squats while pressing your knees out "
                "against the band throughout the entire range of motion."
            ),
            "target": "hip abductors / VMO activation",
        },
        {
            "name": "Clamshells",
            "description": (
                "Lie on your side with knees bent at 90 degrees. Keeping "
                "feet together, lift the top knee as high as possible "
                "without rotating the pelvis. 3 sets of 15 per side."
            ),
            "target": "gluteus medius / hip external rotation",
        },
    ],
    "knee_cave": [
        {
            "name": "Banded Lateral Walks",
            "description": (
                "Place a mini-band around your ankles. Assume a quarter-squat "
                "position and take 10 steps laterally in each direction, "
                "keeping tension on the band at all times."
            ),
            "target": "hip abductors / lateral stability",
        },
    ],
    "shallow_depth": [
        {
            "name": "Goblet Squat to Box",
            "description": (
                "Hold a light kettlebell at your chest. Squat down to a box "
                "set at parallel or slightly below. Pause for 2 seconds at "
                "the bottom to build comfort in the deep position."
            ),
            "target": "hip and ankle mobility / depth confidence",
        },
        {
            "name": "Ankle Mobility Drill (Wall Knee Drives)",
            "description": (
                "Face a wall with one foot about 10 cm away. Drive the knee "
                "over the toes toward the wall without lifting the heel. "
                "Hold 5 seconds, repeat 10 times per side."
            ),
            "target": "ankle dorsiflexion",
        },
        {
            "name": "Deep Squat Hold (Assisted)",
            "description": (
                "Hold onto a door frame or rack at chest height. Lower into "
                "a deep squat and hold for 30 seconds, pushing knees out "
                "with elbows. Repeat 3 times with 15 seconds rest."
            ),
            "target": "hip flexor length / deep squat comfort",
        },
        {
            "name": "90/90 Hip Stretch to Squat",
            "description": (
                "Start in a 90/90 hip position on the floor. Rotate to face "
                "forward, plant both feet, and stand up into a full squat. "
                "Reverse the movement. 3 sets of 5 per side."
            ),
            "target": "hip internal/external rotation / squat depth",
        },
    ],
    "lumbar_rounding": [
        {
            "name": "Cat-Cow Stretches",
            "description": (
                "Start on all fours. Alternate between arching your back "
                "(cow) and rounding it (cat), moving slowly through each "
                "position. Focus on segmental spinal control. 2 sets of 10."
            ),
            "target": "spinal mobility / lumbar awareness",
        },
        {
            "name": "Dead Bug",
            "description": (
                "Lie on your back with arms extended and knees at 90 degrees. "
                "Slowly extend one arm overhead while extending the opposite "
                "leg, keeping your lower back flat on the floor. 3 sets of 8 per side."
            ),
            "target": "core anti-extension / lumbar stabilisation",
        },
    ],
    "excessive_forward_lean": [
        {
            "name": "Pause Front Squats",
            "description": (
                "Using a light load, perform front squats with a 3-second "
                "pause at the bottom. The front-rack position forces a more "
                "upright torso."
            ),
            "target": "thoracic extension / upright posture under load",
        },
        {
            "name": "Wall-Facing Squats",
            "description": (
                "Stand facing a wall with toes 15 cm from the wall. Squat "
                "as deep as possible without touching the wall. This forces "
                "an upright torso. 3 sets of 8."
            ),
            "target": "upright posture / torso awareness",
        },
        {
            "name": "Thoracic Foam Roll + Extension",
            "description": (
                "Place a foam roller across your upper back. With hands "
                "behind your head, extend backwards over the roller for "
                "5 seconds. Move roller to 3 different positions along "
                "the thoracic spine. 2 rounds."
            ),
            "target": "thoracic extension mobility",
        },
    ],
    "hip_sag": [
        {
            "name": "Plank Hold with Hip Awareness",
            "description": (
                "Hold a forearm plank for 30-45 seconds, focusing on "
                "maintaining a straight line from shoulders to ankles. "
                "Have a partner place a dowel along your spine for feedback."
            ),
            "target": "core stability / anti-extension",
        },
        {
            "name": "Glute Bridge",
            "description": (
                "Lie on your back with knees bent and feet flat. Drive hips "
                "up until your body forms a straight line from knees to "
                "shoulders. Squeeze glutes at the top for 2 seconds. "
                "3 sets of 12."
            ),
            "target": "glute activation / hip extension",
        },
    ],
    "hip_shift": [
        {
            "name": "Single-Leg Romanian Deadlift",
            "description": (
                "Standing on one leg, hinge forward at the hips while "
                "extending the free leg behind you. Keep hips square. "
                "Use a light dumbbell for counterbalance. 3 sets of 8 per side."
            ),
            "target": "unilateral hip stability / balance",
        },
    ],
    "asymmetry": [
        {
            "name": "Single-Arm Dumbbell Press",
            "description": (
                "Perform dumbbell presses one arm at a time to isolate "
                "each side. Match the weaker side's reps on the stronger "
                "side. 3 sets of 8-10 per arm."
            ),
            "target": "unilateral strength balance",
        },
        {
            "name": "Bulgarian Split Squat",
            "description": (
                "Elevate your rear foot on a bench and squat on the front "
                "leg. Start with bodyweight, focusing on equal depth and "
                "control on both sides. 3 sets of 8 per leg."
            ),
            "target": "single-leg strength / symmetry",
        },
    ],
    "elbow_flare": [
        {
            "name": "Floor Press with Tucked Elbows",
            "description": (
                "Lie on the floor and press dumbbells with elbows at "
                "roughly 45 degrees to your torso. The floor limits range "
                "of motion and encourages proper elbow positioning. "
                "3 sets of 10."
            ),
            "target": "shoulder-safe pressing pattern",
        },
    ],
    "kipping": [
        {
            "name": "Strict Tempo Pull-ups",
            "description": (
                "Perform pull-ups with a 3-second concentric, 1-second "
                "hold at the top, and 3-second eccentric. Use a band for "
                "assistance if needed. 3 sets of 5."
            ),
            "target": "strict pulling strength / swing elimination",
        },
    ],
    "incomplete_lockout": [
        {
            "name": "Isometric Hold at Top",
            "description": (
                "At the top of each rep, hold the fully locked-out position "
                "for 3 seconds before starting the descent. Focus on "
                "complete joint extension. 3 sets of 6."
            ),
            "target": "full range of motion / lockout strength",
        },
    ],
    "trunk_instability": [
        {
            "name": "Pallof Press",
            "description": (
                "Using a cable or band at chest height, press your hands "
                "straight out in front of you and hold for 5 seconds. "
                "Resist the rotational pull. 3 sets of 8 per side."
            ),
            "target": "anti-rotation core stability",
        },
    ],
    "balance_fail": [
        {
            "name": "Single-Leg Balance Holds",
            "description": (
                "Stand on one foot for 30 seconds. Progress by closing "
                "your eyes or standing on an unstable surface. Perform "
                "3 rounds per leg."
            ),
            "target": "proprioception / balance",
        },
        {
            "name": "Slow Eccentric Bodyweight Squats",
            "description": (
                "Perform bodyweight squats with a 5-second descent. Focus "
                "on keeping weight centred over mid-foot throughout. "
                "3 sets of 6 reps."
            ),
            "target": "balance under load / eccentric control",
        },
        {
            "name": "Tandem Stance RDL",
            "description": (
                "Stand with one foot slightly behind the other (heel-to-toe). "
                "Hinge forward keeping hips level. Hold 3 seconds at the "
                "bottom. 3 sets of 6 per stance."
            ),
            "target": "balance / hip stability",
        },
    ],
}

# Fallback drill when no specific marker is matched
_FALLBACK_DRILL: dict[str, str] = {
    "name": "General Mobility Flow",
    "description": (
        "Perform a 5-minute flow: 10 hip circles per direction, "
        "10 leg swings per side, 10 thoracic rotations per side, "
        "and 30 seconds of deep squat hold."
    ),
    "target": "general mobility and warm-up",
}


def get_corrective_drills(
    exercise_type: str,
    risk_markers: dict[str, Any],
    rotation_seed: int | None = None,
) -> list[dict[str, str]]:
    """Return corrective drills for the given *risk_markers*.

    This is a static lookup; it does **not** call an LLM.  Each risk
    marker that has a matching entry in the drill database contributes
    one drill to the returned list.  If no markers match, a general
    mobility drill is returned.

    When ``rotation_seed`` is provided (e.g. a hash of the session ID),
    the drill selected from each candidate list is rotated so users see
    variety across sessions rather than always the first drill.

    Parameters
    ----------
    exercise_type:
        The exercise being analysed (used for context but the drill
        database is currently exercise-agnostic).
    risk_markers:
        Dict where keys are marker names and truthy values indicate the
        marker is active.  Example: ``{"knee_valgus": True, "hip_sag": False}``.
    rotation_seed:
        Optional integer used to rotate drill selection. Pass
        ``hash(session_id)`` to vary drills across sessions.

    Returns
    -------
    list[dict]
        Each dict has keys ``name``, ``description``, and ``target``.
    """
    drills: list[dict[str, str]] = []
    seen_names: set[str] = set()

    for marker, active in risk_markers.items():
        if not active:
            continue
        candidates = _DRILL_DATABASE.get(marker, [])
        if not candidates:
            # Try partial matching (e.g. "knee_valgus_left" -> "knee_valgus")
            for db_key, db_drills in _DRILL_DATABASE.items():
                if db_key in marker or marker in db_key:
                    candidates = db_drills
                    break

        if candidates:
            # Rotate drill selection based on seed for variety
            if rotation_seed is not None and len(candidates) > 1:
                start_idx = abs(rotation_seed) % len(candidates)
                rotated = candidates[start_idx:] + candidates[:start_idx]
            else:
                rotated = candidates
            for drill in rotated:
                if drill["name"] not in seen_names:
                    drills.append(dict(drill))
                    seen_names.add(drill["name"])
                    break

    if not drills:
        drills.append(dict(_FALLBACK_DRILL))

    return drills
