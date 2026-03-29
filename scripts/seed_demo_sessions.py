"""Seed realistic demo sessions directly into the production database.

Creates sessions for the past week (Feb 24 - Mar 1, 2026) with
a realistic training split across varied exercises.

Usage:
    python scripts/seed_demo_sessions.py
"""

import os
import random
import uuid

import psycopg2

# Railway prod DB — set DATABASE_URL env var before running
DB_URL = os.environ.get("DATABASE_URL", "").replace("+asyncpg", "")
if not DB_URL:
    raise SystemExit("Set DATABASE_URL environment variable before running this script.")
USER_ID = "14a661f0-8648-4db1-9d6a-134be55b15ae"

# ---------------------------------------------------------------------------
# Realistic weekly training split
# ---------------------------------------------------------------------------
SESSIONS = [
    # Feb 24 (Mon) — Lower body: Squat focus
    {
        "ts": "2026-02-24T07:30:00+00:00",
        "exercise_type": "squat",
        "load_kg": 60.0,
        "sets": [
            (5, 72, 80),
            (5, 74, 82),
            (5, 76, 84),
        ],
    },
    {
        "ts": "2026-02-24T08:00:00+00:00",
        "exercise_type": "lunge",
        "load_kg": 20.0,
        "sets": [
            (8, 68, 78),
            (8, 70, 80),
            (8, 66, 76),
        ],
    },
    # Feb 25 (Tue) — Upper push day
    {
        "ts": "2026-02-25T18:15:00+00:00",
        "exercise_type": "bench_press",
        "load_kg": 70.0,
        "sets": [
            (6, 70, 80),
            (6, 72, 82),
            (6, 68, 78),
            (6, 65, 76),
        ],
    },
    {
        "ts": "2026-02-25T18:45:00+00:00",
        "exercise_type": "overhead_press",
        "load_kg": 40.0,
        "sets": [
            (8, 66, 76),
            (8, 68, 78),
            (8, 64, 74),
        ],
    },
    # Feb 27 (Thu) — Pull day: Deadlift + Row
    {
        "ts": "2026-02-27T17:00:00+00:00",
        "exercise_type": "deadlift",
        "load_kg": 100.0,
        "sets": [
            (4, 74, 84),
            (4, 76, 86),
            (4, 72, 82),
        ],
    },
    {
        "ts": "2026-02-27T17:30:00+00:00",
        "exercise_type": "row",
        "load_kg": 50.0,
        "sets": [
            (8, 70, 80),
            (8, 72, 82),
            (8, 68, 78),
        ],
    },
    # Feb 28 (Fri) — Bodyweight / active recovery
    {
        "ts": "2026-02-28T08:00:00+00:00",
        "exercise_type": "pushup",
        "load_kg": 0.0,
        "sets": [
            (12, 76, 86),
            (12, 74, 84),
            (10, 70, 80),
        ],
    },
    {
        "ts": "2026-02-28T08:20:00+00:00",
        "exercise_type": "pullup",
        "load_kg": 0.0,
        "sets": [
            (6, 72, 82),
            (6, 70, 80),
            (5, 66, 76),
        ],
    },
    # Mar 1 (Sat) — Peak squat day (best form for demo)
    {
        "ts": "2026-03-01T10:30:00+00:00",
        "exercise_type": "squat",
        "load_kg": 90.0,
        "sets": [
            (5, 80, 90),
            (5, 82, 92),
            (5, 78, 88),
            (5, 76, 86),
        ],
    },
]


def generate_rep(rep_num: int, total_reps: int, form_low: int, form_high: int) -> dict:
    """Generate a single rep with realistic biomechanics."""
    fatigue_factor = 1.0 - (rep_num - 1) * 0.015
    base_score = random.uniform(form_low, form_high) * fatigue_factor

    knee_flexion = random.uniform(85, 115)
    trunk_angle = random.uniform(15, 35)
    com_offset = random.uniform(0.01, 0.06)

    depth_ok = knee_flexion >= 80
    form_ok = base_score >= 65
    balance_ok = com_offset < 0.08
    trunk_ok = trunk_angle < 45

    depth_score = min(100, max(30, 50 + (knee_flexion - 80) * 1.5 + random.uniform(-5, 5)))
    stability_score = min(100, max(40, 95 - com_offset * 300 + random.uniform(-8, 8)))
    symmetry_score = min(100, max(30, random.uniform(65, 95)))
    rom_score = min(100, max(40, 60 + (knee_flexion - 80) * 1.2 + random.uniform(-5, 5)))
    tempo_score = min(100, max(40, random.uniform(60, 90)))

    composite = round(
        (depth_score * 0.25 + stability_score * 0.20 + symmetry_score * 0.15 +
         rom_score * 0.20 + tempo_score * 0.20) * fatigue_factor, 1
    )

    eccentric_ms = random.randint(800, 1600)
    pause_ms = random.randint(100, 500)
    concentric_ms = random.randint(600, 1200)
    duration_ms = eccentric_ms + pause_ms + concentric_ms

    return {
        "rep_number": rep_num,
        "duration_ms": duration_ms,
        "depth_ok": depth_ok,
        "form_ok": form_ok,
        "balance_ok": balance_ok,
        "trunk_ok": trunk_ok,
        "primary_angle_deg": round(knee_flexion, 1),
        "trunk_angle_deg": round(trunk_angle, 1),
        "com_offset_norm": round(com_offset, 4),
        "speed_proxy": round(random.uniform(0.3, 0.8), 3),
        "pose_confidence": round(random.uniform(0.85, 0.98), 3),
        "eccentric_ms": eccentric_ms,
        "pause_ms": pause_ms,
        "concentric_ms": concentric_ms,
        "composite_score": composite,
        "depth_score": round(depth_score, 1),
        "stability_score": round(stability_score, 1),
        "symmetry_score": round(symmetry_score, 1),
        "tempo_score": round(tempo_score, 1),
        "rom_score": round(rom_score, 1),
    }


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Delete all existing sessions for this user (cascade deletes sets + reps)
    print("Deleting existing sessions...")
    cur.execute("DELETE FROM sessions WHERE user_id = %s", (USER_ID,))
    deleted = cur.rowcount
    print(f"  Deleted {deleted} sessions")

    # 2. Create new sessions
    for plan in SESSIONS:
        ts = plan["ts"]
        exercise = plan["exercise_type"]
        load_kg = plan["load_kg"]
        sets_config = plan["sets"]

        session_id = str(uuid.uuid4())
        total_reps = sum(s[0] for s in sets_config)
        total_sets = len(sets_config)

        # Generate all reps first to compute session-level stats
        all_set_data = []
        all_composite_scores = []

        for set_idx, (target_reps, form_low, form_high) in enumerate(sets_config, 1):
            set_id = str(uuid.uuid4())
            reps = [generate_rep(i + 1, target_reps, form_low, form_high) for i in range(target_reps)]
            scores = [r["composite_score"] for r in reps]
            avg_form = round(sum(scores) / len(scores), 1)
            all_composite_scores.extend(scores)

            if len(scores) >= 2:
                fatigue_index = round(max(0, scores[0] - scores[-1]), 1)
            else:
                fatigue_index = 0.0

            fatigue_risk = "low" if fatigue_index < 10 else ("moderate" if fatigue_index < 20 else "high")

            all_set_data.append({
                "set_id": set_id,
                "set_number": set_idx,
                "target_reps": target_reps,
                "actual_reps": target_reps,
                "avg_form_score": avg_form,
                "fatigue_index": fatigue_index,
                "fatigue_risk": fatigue_risk,
                "reps": reps,
            })

        # Session-level stats
        session_avg_form = round(sum(all_composite_scores) / len(all_composite_scores), 1)
        if len(all_composite_scores) >= 2:
            session_fatigue = round(max(0, all_composite_scores[0] - all_composite_scores[-1]), 1)
        else:
            session_fatigue = 0.0
        session_fatigue_risk = "low" if session_fatigue < 10 else ("moderate" if session_fatigue < 20 else "high")

        # Find strongest/weakest sets
        set_scores = [(sd["set_id"], sd["avg_form_score"]) for sd in all_set_data]
        strongest = max(set_scores, key=lambda x: x[1])[0]
        weakest = min(set_scores, key=lambda x: x[1])[0]

        # Insert session
        cur.execute("""
            INSERT INTO sessions (
                id, user_id, exercise_type, status, total_reps, total_sets,
                avg_form_score, fatigue_index, fatigue_risk,
                strongest_set_id, weakest_set_id,
                load_used, source, started_at, completed_at, created_at
            ) VALUES (
                %s, %s, %s, 'completed', %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, 'upload', %s, %s, %s
            )
        """, (
            session_id, USER_ID, exercise, total_reps, total_sets,
            session_avg_form, session_fatigue, session_fatigue_risk,
            strongest, weakest,
            load_kg, ts, ts, ts,
        ))

        print(f"  {ts[:10]} — {exercise:16s} @ {load_kg:5.0f}kg | {total_sets} sets, {total_reps} reps, form={session_avg_form}")

        # Insert sets and reps
        for sd in all_set_data:
            cur.execute("""
                INSERT INTO sets (
                    id, session_id, set_number, target_reps, actual_reps,
                    avg_form_score, fatigue_index, fatigue_risk,
                    load_used, created_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s
                )
            """, (
                sd["set_id"], session_id, sd["set_number"], sd["target_reps"], sd["actual_reps"],
                sd["avg_form_score"], sd["fatigue_index"], sd["fatigue_risk"],
                load_kg, ts,
            ))

            for rep in sd["reps"]:
                rep_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO reps (
                        id, set_id, session_id, rep_number,
                        duration_ms, eccentric_ms, pause_ms, concentric_ms,
                        composite_score, depth_score, stability_score,
                        symmetry_score, tempo_score, rom_score,
                        primary_angle_deg, trunk_angle_deg,
                        com_offset_norm, speed_proxy, pose_confidence,
                        depth_ok, form_ok, balance_ok, trunk_ok,
                        created_at
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s
                    )
                """, (
                    rep_id, sd["set_id"], session_id, rep["rep_number"],
                    rep["duration_ms"], rep["eccentric_ms"], rep["pause_ms"], rep["concentric_ms"],
                    rep["composite_score"], rep["depth_score"], rep["stability_score"],
                    rep["symmetry_score"], rep["tempo_score"], rep["rom_score"],
                    rep["primary_angle_deg"], rep["trunk_angle_deg"],
                    rep["com_offset_norm"], rep["speed_proxy"], rep["pose_confidence"],
                    rep["depth_ok"], rep["form_ok"], rep["balance_ok"], rep["trunk_ok"],
                    ts,
                ))

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nDone! {len(SESSIONS)} sessions created with correct dates.")


if __name__ == "__main__":
    main()
