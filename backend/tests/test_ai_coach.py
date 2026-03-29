from __future__ import annotations

"""Tests for the AI coaching module (static drill lookup only -- no LLM calls)."""
import pytest

from backend.ai.coach import get_corrective_drills, _extract_json, _validate_coaching_response


class TestCorrectiveDrills:
    def test_knee_valgus_drill(self):
        drills = get_corrective_drills("squat", {"knee_valgus": True})
        assert len(drills) >= 1
        assert any("Banded" in d["name"] or "Clamshell" in d["name"] for d in drills)

    def test_lumbar_rounding_drill(self):
        drills = get_corrective_drills("deadlift", {"lumbar_rounding": True})
        assert len(drills) >= 1

    def test_hip_sag_drill(self):
        drills = get_corrective_drills("pushup", {"hip_sag": True})
        assert len(drills) >= 1

    def test_multiple_markers(self):
        drills = get_corrective_drills("squat", {"knee_valgus": True, "shallow_depth": True})
        assert len(drills) >= 2

    def test_no_active_markers(self):
        drills = get_corrective_drills("squat", {"knee_valgus": False})
        assert len(drills) >= 1  # fallback drill

    def test_unknown_marker_fallback(self):
        drills = get_corrective_drills("squat", {"nonexistent_marker": True})
        assert len(drills) >= 1  # fallback

    def test_empty_markers(self):
        drills = get_corrective_drills("squat", {})
        assert len(drills) >= 1  # fallback

    def test_drill_has_required_keys(self):
        drills = get_corrective_drills("squat", {"knee_valgus": True})
        for drill in drills:
            assert "name" in drill
            assert "description" in drill


class TestExtractJson:
    def test_plain_json(self):
        result = _extract_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_markdown_fenced_json(self):
        text = '```json\n{"key": "value"}\n```'
        result = _extract_json(text)
        assert result == {"key": "value"}

    def test_json_with_prose(self):
        text = 'Here is the response:\n{"key": "value"}\nDone.'
        result = _extract_json(text)
        assert result == {"key": "value"}

    def test_invalid_json(self):
        result = _extract_json("not json at all")
        assert result is None

    def test_empty_string(self):
        result = _extract_json("")
        assert result is None

    def test_none(self):
        result = _extract_json(None)
        assert result is None


class TestValidateCoachingResponse:
    def test_valid_response(self):
        parsed = {
            "coaching_cues": ["Keep your chest up", "Push knees out"],
            "corrective_drill": {"name": "Box Squat", "description": "Squat to a box."},
            "recovery_suggestion": "Rest 48 hours.",
        }
        result = _validate_coaching_response(parsed)
        assert result is not None
        assert len(result["coaching_cues"]) == 2

    def test_missing_cues(self):
        parsed = {
            "coaching_cues": [],
            "corrective_drill": {"name": "Box Squat"},
        }
        result = _validate_coaching_response(parsed)
        assert result is None

    def test_cues_trimmed_to_five(self):
        parsed = {
            "coaching_cues": [f"Cue {i}" for i in range(10)],
        }
        result = _validate_coaching_response(parsed)
        assert result is not None
        assert len(result["coaching_cues"]) == 5

    def test_missing_drill_gets_default(self):
        parsed = {
            "coaching_cues": ["Keep your chest up"],
        }
        result = _validate_coaching_response(parsed)
        assert result is not None
        assert "name" in result["corrective_drill"]

    def test_missing_recovery_gets_default(self):
        parsed = {
            "coaching_cues": ["Push knees out"],
        }
        result = _validate_coaching_response(parsed)
        assert result is not None
        assert result["recovery_suggestion"] != ""
