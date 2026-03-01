"""Exercise catalogue router: list exercises, get config, get program, tutorial, weekly plan."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.deps import get_current_user, get_current_user_id, get_db
from backend.models.session import Session
from backend.models.user import User
from backend.schemas.exercise import ExerciseInfo, ExerciseListResponse, ExerciseProgram
from backend.services.exercise_registry import get_all_exercises, get_exercise_by_name
from backend.services.load_recommender import LoadRecommender
from backend.services.programming import ProgrammingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exercises", tags=["exercises"])

_recommender = LoadRecommender()
_programming = ProgrammingEngine()


# ---------------------------------------------------------------------------
# GET / -- list all exercises (no auth required)
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=ExerciseListResponse,
    summary="List all supported exercises",
)
async def list_exercises() -> ExerciseListResponse:
    """Return metadata for every registered exercise."""
    configs = get_all_exercises()
    exercises = [
        ExerciseInfo(
            exercise_type=cfg.exercise_type.value,
            display_name=cfg.display_name,
            category=cfg.category,
            primary_side=cfg.primary_side,
            description=cfg.description,
        )
        for cfg in configs
    ]
    return ExerciseListResponse(exercises=exercises)


# ---------------------------------------------------------------------------
# GET /weekly-plan -- personalized weekly programming (MUST be before /{exercise_type})
# ---------------------------------------------------------------------------

# Default weekly splits by training frequency
_WEEKLY_SPLITS: dict[int, list[list[str]]] = {
    2: [["squat", "bench_press"], ["deadlift", "overhead_press"]],
    3: [["squat", "bench_press"], ["deadlift", "row"], ["squat", "overhead_press"]],
    4: [["squat"], ["bench_press", "row"], ["deadlift"], ["overhead_press", "pullup"]],
    5: [["squat"], ["bench_press"], ["deadlift"], ["overhead_press", "row"], ["squat", "pullup"]],
}


@router.get(
    "/weekly-plan",
    summary="Get a personalized weekly workout plan",
)
async def get_weekly_plan(
    days_per_week: int = Query(default=3, ge=2, le=5, description="Training days per week"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a weekly workout plan based on user's goal, experience, and recent history."""
    goal = user.goal or "general"
    experience = user.experience_level or "intermediate"
    training_max = user.training_max or {}

    # Fetch recent sessions for programming decisions
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user.id, Session.completed_at.isnot(None))
        .order_by(Session.created_at.desc())
        .limit(10)
    )
    recent_sessions_orm = result.scalars().all()

    # Build recent sessions dict for programming engine
    recent_by_exercise: dict[str, list[dict]] = {}
    for s in recent_sessions_orm:
        et = s.exercise_type
        if et not in recent_by_exercise:
            recent_by_exercise[et] = []
        recent_by_exercise[et].append({
            "avg_form_score": s.avg_form_score,
            "fatigue_risk": s.fatigue_risk,
            "fatigue_index": s.fatigue_index,
        })

    # Determine if deload is needed from overall session history
    all_recent = [
        {"avg_form_score": s.avg_form_score, "fatigue_risk": s.fatigue_risk, "fatigue_index": s.fatigue_index}
        for s in recent_sessions_orm
    ]
    deload_needed = _programming.detect_deload_needed(all_recent)

    # Get recovery prompt
    latest_fatigue = recent_sessions_orm[0].fatigue_risk if recent_sessions_orm else "low"
    recovery_prompt = _programming.get_recovery_prompt(
        latest_fatigue or "low",
        min(len(recent_sessions_orm), 7),
    )

    # Build the weekly plan
    split = _WEEKLY_SPLITS.get(days_per_week, _WEEKLY_SPLITS[3])
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    if days_per_week == 2:
        training_day_indices = [0, 3]
    elif days_per_week == 3:
        training_day_indices = [0, 2, 4]
    elif days_per_week == 4:
        training_day_indices = [0, 1, 3, 4]
    else:
        training_day_indices = [0, 1, 2, 3, 4]

    weekly_plan = []
    split_idx = 0
    for day_idx in range(7):
        day_name = day_names[day_idx]
        if day_idx in training_day_indices and split_idx < len(split):
            exercises_for_day = split[split_idx]
            day_workouts = []
            for ex_type in exercises_for_day:
                recent_for_ex = recent_by_exercise.get(ex_type, [])
                workout = _programming.generate_workout(
                    goal=goal,
                    experience_level=experience,
                    exercise_type=ex_type,
                    training_max=training_max,
                    recent_sessions=recent_for_ex[:5],
                )
                try:
                    cfg = get_exercise_by_name(ex_type)
                    workout["display_name"] = cfg.display_name
                except KeyError:
                    workout["display_name"] = ex_type.replace("_", " ").title()
                day_workouts.append(workout)

            weekly_plan.append({
                "day": day_name,
                "is_rest_day": False,
                "workouts": day_workouts,
            })
            split_idx += 1
        else:
            weekly_plan.append({
                "day": day_name,
                "is_rest_day": True,
                "workouts": [],
            })

    # Determine overall phase
    phase_counts: dict[str, int] = {}
    for day in weekly_plan:
        for w in day.get("workouts", []):
            p = w.get("periodization_phase", "accumulation")
            phase_counts[p] = phase_counts.get(p, 0) + 1
    overall_phase = max(phase_counts, key=lambda k: phase_counts[k]) if phase_counts else "accumulation"

    return {
        "goal": goal,
        "experience_level": experience,
        "days_per_week": days_per_week,
        "periodization_phase": overall_phase,
        "deload_needed": deload_needed,
        "recovery_prompt": recovery_prompt,
        "weekly_plan": weekly_plan,
    }


# ---------------------------------------------------------------------------
# GET /{exercise_type} -- get specific exercise config
# ---------------------------------------------------------------------------

@router.get(
    "/{exercise_type}",
    response_model=ExerciseInfo,
    summary="Get a specific exercise configuration",
)
async def get_exercise(exercise_type: str) -> ExerciseInfo:
    """Return metadata for a single exercise by its type key."""
    try:
        cfg = get_exercise_by_name(exercise_type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    return ExerciseInfo(
        exercise_type=cfg.exercise_type.value,
        display_name=cfg.display_name,
        category=cfg.category,
        primary_side=cfg.primary_side,
        description=cfg.description,
    )


# ---------------------------------------------------------------------------
# GET /{exercise_type}/program -- goal-based programming
# ---------------------------------------------------------------------------

@router.get(
    "/{exercise_type}/program",
    response_model=ExerciseProgram,
    summary="Get a goal-based training program for an exercise",
)
async def get_program(
    exercise_type: str,
    goal: str = Query(
        ...,
        description="Training goal: 'strength', 'muscle_gain', 'fat_loss', 'athletic'",
    ),
    experience_level: str = Query(
        ...,
        description="Experience level: 'beginner', 'intermediate', 'advanced'",
    ),
    training_max_kg: float | None = Query(
        default=None,
        ge=0.0,
        description="Training max (1RM estimate) in kg",
    ),
) -> ExerciseProgram:
    """Return a goal-based programming prescription for the exercise."""
    # Validate exercise type exists
    try:
        get_exercise_by_name(exercise_type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

    program = _recommender.get_program(
        exercise_type=exercise_type,
        goal=goal,
        experience_level=experience_level,
        training_max_kg=training_max_kg,
    )

    return ExerciseProgram(
        exercise_type=exercise_type,
        goal=goal,
        experience_level=experience_level,
        sets=program["sets"],
        reps=program["reps"],
        load_kg=program.get("load_kg"),
        rest_seconds=program["rest_seconds"],
    )


# ---------------------------------------------------------------------------
# GET /{exercise_type}/tutorial -- exercise tutorial and coaching tips
# ---------------------------------------------------------------------------

# Static tips and common mistakes per exercise category / type.
# Built from exercise config data (description, scoring weights, risk markers).
_EXERCISE_TIPS: dict[str, dict[str, Any]] = {
    "squat": {
        "tips": [
            "Keep your chest up and maintain a neutral spine throughout the movement.",
            "Drive your knees out in line with your toes to prevent valgus collapse.",
            "Descend until hip crease is at or below knee level for full depth.",
            "Brace your core and take a deep breath before each rep.",
            "Push through the full foot, keeping weight balanced between heel and midfoot.",
        ],
        "common_mistakes": [
            "Knee cave (valgus) during ascent",
            "Excessive forward lean / chest drop",
            "Shallow depth (not reaching parallel)",
            "Rising on toes or shifting weight forward",
            "Lumbar rounding at the bottom position",
        ],
    },
    "deadlift": {
        "tips": [
            "Maintain a flat back by engaging your lats and bracing your core.",
            "Keep the bar close to your body throughout the entire lift.",
            "Push the floor away with your legs rather than pulling with your back.",
            "Lock out by driving your hips forward, squeezing your glutes at the top.",
            "Lower the bar under control by hinging at the hips first.",
        ],
        "common_mistakes": [
            "Rounding the lower back during the pull",
            "Letting the bar drift away from the body",
            "Jerking the bar off the floor instead of building tension",
            "Hyperextending at the top of the lift",
            "Hips rising faster than shoulders (stiff-leg pull)",
        ],
    },
    "lunge": {
        "tips": [
            "Take a long enough step to allow both knees to reach roughly 90 degrees.",
            "Keep your torso upright and your core engaged.",
            "Push through the front heel to return to the starting position.",
            "Maintain knee tracking over your toes on the front leg.",
            "Avoid letting the rear knee slam into the ground.",
        ],
        "common_mistakes": [
            "Knee cave on the front leg",
            "Short stride leading to excessive forward knee travel",
            "Leaning the torso too far forward",
            "Losing balance laterally",
            "Uneven step length between sides",
        ],
    },
    "pushup": {
        "tips": [
            "Keep your body in a straight line from head to heels.",
            "Position your hands slightly wider than shoulder-width apart.",
            "Lower your chest to just above the floor for full range of motion.",
            "Keep your elbows at roughly 45 degrees to your torso.",
            "Engage your glutes and core to prevent hip sag.",
        ],
        "common_mistakes": [
            "Hip sag or pike (breaking the straight-line position)",
            "Flaring elbows out to 90 degrees",
            "Incomplete range of motion (partial reps)",
            "Head dropping forward or looking up",
            "Not fully locking out at the top",
        ],
    },
    "bench_press": {
        "tips": [
            "Retract and depress your shoulder blades before unracking.",
            "Lower the bar to your mid-chest with control.",
            "Keep your feet flat on the floor and maintain a slight arch.",
            "Drive the bar up and slightly back toward the rack.",
            "Tuck your elbows at roughly 45 degrees to your torso.",
        ],
        "common_mistakes": [
            "Elbow flare (elbows at 90 degrees)",
            "Bouncing the bar off the chest",
            "Flat back (no scapular retraction)",
            "Uneven bar path or asymmetric pressing",
            "Lifting hips off the bench",
        ],
    },
    "overhead_press": {
        "tips": [
            "Start with the bar at your collarbone and press straight overhead.",
            "Brace your core and squeeze your glutes to stabilize your torso.",
            "Move your head through the window once the bar clears your forehead.",
            "Lock out fully with the bar over the midfoot.",
            "Control the descent back to the starting position.",
        ],
        "common_mistakes": [
            "Excessive lower back arch (hyperextension)",
            "Pressing the bar forward instead of straight up",
            "Not locking out at the top",
            "Using leg drive (turning it into a push press)",
            "Flaring the ribcage instead of bracing",
        ],
    },
    "row": {
        "tips": [
            "Hinge at the hips to roughly 45 degrees and keep your back flat.",
            "Pull the bar or dumbbells toward your lower ribcage.",
            "Squeeze your shoulder blades together at the top of each rep.",
            "Keep your elbows close to your body during the pull.",
            "Lower the weight under control without rounding your back.",
        ],
        "common_mistakes": [
            "Using momentum (swinging the torso) to lift the weight",
            "Rounding the upper or lower back",
            "Pulling too high (toward the neck)",
            "Not achieving full scapular retraction",
            "Standing too upright (insufficient hip hinge)",
        ],
    },
    "pullup": {
        "tips": [
            "Start from a dead hang with your arms fully extended.",
            "Pull your chest toward the bar by driving your elbows down and back.",
            "Control the descent to a full dead hang on every rep.",
            "Engage your lats by depressing your shoulders before pulling.",
            "Avoid swinging or kipping unless intentionally performing kipping pull-ups.",
        ],
        "common_mistakes": [
            "Kipping or swinging to generate momentum",
            "Incomplete range of motion (chin not clearing the bar)",
            "Not fully extending at the bottom",
            "Shrugging shoulders up instead of depressing them",
            "Using only biceps instead of engaging the lats",
        ],
    },
}


@router.get(
    "/{exercise_type}/tutorial",
    summary="Get exercise tutorial with tips, common mistakes, and key angles",
)
async def get_tutorial(exercise_type: str) -> dict[str, Any]:
    """Return coaching tips, common mistakes, and key angle cues for the exercise.

    No authentication required. The response is built from the exercise
    configuration's description, scoring weights, and risk markers.
    """
    try:
        cfg = get_exercise_by_name(exercise_type)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

    # Build key_angles from the exercise config
    key_angles: dict[str, str] = {}
    rep_signal = cfg.rep_signal
    if rep_signal == "knee_flexion":
        key_angles["knee_flexion"] = f"< {cfg.bottom_threshold} degrees for full depth"
        key_angles["trunk_angle"] = f"< {cfg.max_trunk_angle} degrees to avoid excessive forward lean"
    elif rep_signal == "hip_hinge":
        key_angles["hip_angle"] = f"Hinge until torso is at approximately {cfg.bottom_threshold} degrees"
        key_angles["trunk_angle"] = f"< {cfg.max_trunk_angle} degrees from horizontal"
    elif rep_signal == "elbow_flexion":
        key_angles["elbow_flexion"] = f"Full extension at {cfg.standing_threshold} degrees, flexion to {cfg.bottom_threshold} degrees"
    elif rep_signal == "shoulder_angle":
        key_angles["shoulder_angle"] = f"Full range from {cfg.bottom_threshold} to {cfg.standing_threshold} degrees"

    # Add balance margin info
    key_angles["balance_margin"] = f"Centre of mass offset should stay within {cfg.balance_margin:.0%} of stance width"

    # Retrieve exercise-specific tips or build generic ones
    exercise_key = cfg.exercise_type.value
    tips_data = _EXERCISE_TIPS.get(exercise_key, {})
    tips = tips_data.get("tips", [
        f"Focus on controlled movement through the full range of motion for {cfg.display_name}.",
        "Brace your core before each rep.",
        "Maintain consistent tempo throughout the set.",
    ])
    common_mistakes = tips_data.get("common_mistakes", [
        "Incomplete range of motion",
        "Loss of core tension",
        "Inconsistent tempo between reps",
    ])

    return {
        "exercise_type": exercise_key,
        "display_name": cfg.display_name,
        "tips": tips,
        "common_mistakes": common_mistakes,
        "key_angles": key_angles,
    }
