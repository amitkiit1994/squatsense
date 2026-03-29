"""League API router: teams, sessions, kiosk pairing, profiles, leaderboards, stats."""

from __future__ import annotations

import logging
import secrets
import time
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.deps import get_db, get_league_player_id, get_optional_league_player_id
from backend.rate_limit import limiter
from backend.models.league import DailyLog, LeaguePlayer, LeagueSession, LeagueTeam
from backend.schemas.league import (
    CompleteSessionRequest,
    CompleteSessionResponse,
    CreateTeamRequest,
    GlobalStatsResponse,
    KioskJoinRequest,
    KioskPendingResponse,
    KioskRegisterResponse,
    KioskSessionCompleteRequest,
    LeaderboardEntry,
    PlayerProfileResponse,
    SessionHistoryEntry,
    StartSessionRequest,
    StartSessionResponse,
    TeamResponse,
)
from backend.services.movement_points import (
    calculate_session_points,
    check_daily_caps,
    compute_rank,
    get_or_create_daily_log,
    get_streak_multiplier,
    update_streak,
)
from backend.services.profanity import is_nickname_clean

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/league", tags=["league"])

# ── In-memory kiosk state ────────────────────────────────────────────────────
# NOTE: All kiosk state below lives in process memory and is lost on server
# restart or deploy. At launch scale (5 kiosks, <200 users), this is acceptable
# because the kiosk TV auto-refreshes and re-registers, and queues rarely
# exceed 2-3 people. Consider migrating to database-backed state if kiosk
# count grows beyond 10 or if deploys cause noticeable user disruption.
_kiosk_registry: dict[str, str] = {}       # kiosk_id -> team_code
_kiosk_queue: dict[str, list[dict]] = {}   # kiosk_id -> queue entries
_kiosk_active: dict[str, dict | None] = {} # kiosk_id -> active player
_player_results: dict[str, dict] = {}      # player_id_str -> results for polling

_QUEUE_ENTRY_TTL = 300  # 5 minutes
_RESULT_TTL = 300       # 5 minutes


def _clean_stale_entries(kiosk_id: str) -> None:
    """Remove queue entries older than TTL."""
    if kiosk_id not in _kiosk_queue:
        return
    now = time.time()
    _kiosk_queue[kiosk_id] = [
        e for e in _kiosk_queue[kiosk_id]
        if now - e["timestamp"] < _QUEUE_ENTRY_TTL
    ]
    # Also clean stale player results
    stale_keys = [
        k for k, v in _player_results.items()
        if now - v.get("timestamp", 0) >= _RESULT_TTL
    ]
    for k in stale_keys:
        del _player_results[k]


# ══════════════════════════════════════════════════════════════════════════════
# TEAMS
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/teams", response_model=TeamResponse)
@limiter.limit("5/minute")
async def create_team(
    request: Request,
    body: CreateTeamRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new team/office."""
    code = secrets.token_hex(3).upper()  # 6-char hex like "A3F1B2"

    team = LeagueTeam(name=body.name, code=code)
    db.add(team)
    await db.flush()

    logger.info("Team created: %s (%s)", body.name, code)

    return TeamResponse(
        id=team.id,
        name=team.name,
        code=team.code,
        total_points=team.total_points,
        total_sessions=team.total_sessions,
        member_count=team.member_count,
        created_at=team.created_at,
    )


@router.get("/teams/{code}", response_model=TeamResponse)
async def get_team(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Get team info by code."""
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == code.upper())
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    return TeamResponse(
        id=team.id,
        name=team.name,
        code=team.code,
        total_points=team.total_points,
        total_sessions=team.total_sessions,
        member_count=team.member_count,
        created_at=team.created_at,
    )


@router.get("/teams/{code}/leaderboard", response_model=list[LeaderboardEntry])
async def get_team_leaderboard(
    code: str,
    period: str = Query("week", pattern="^(today|week|alltime)$"),
    db: AsyncSession = Depends(get_db),
    player_id: UUID | None = Depends(get_optional_league_player_id),
):
    """Get team leaderboard."""
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == code.upper())
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    # Build query based on period
    query = (
        select(
            LeaguePlayer.id,
            LeaguePlayer.nickname,
            LeaguePlayer.avatar_seed,
            LeaguePlayer.rank,
            func.coalesce(func.sum(LeagueSession.points_earned), 0).label(
                "total"
            ),
        )
        .outerjoin(
            LeagueSession, LeagueSession.player_id == LeaguePlayer.id
        )
        .where(LeaguePlayer.team_id == team.id)
    )

    today_utc = datetime.now(timezone.utc).date()

    if period == "today":
        query = query.where(
            func.date(LeagueSession.created_at) == today_utc
        )
    elif period == "week":
        week_start = today_utc - timedelta(days=today_utc.weekday())
        query = query.where(
            func.date(LeagueSession.created_at) >= week_start
        )

    query = (
        query.group_by(
            LeaguePlayer.id,
            LeaguePlayer.nickname,
            LeaguePlayer.avatar_seed,
            LeaguePlayer.rank,
        )
        .order_by(func.coalesce(func.sum(LeagueSession.points_earned), 0).desc())
        .limit(50)
    )

    rows = (await db.execute(query)).all()

    return [
        LeaderboardEntry(
            position=i + 1,
            player_id=row.id,
            nickname=row.nickname,
            avatar_seed=row.avatar_seed,
            rank=row.rank,
            value=float(row.total),
            is_current_player=(player_id is not None and row.id == player_id),
        )
        for i, row in enumerate(rows)
    ]


@router.get("/teams/{code}/today")
async def get_team_today(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Get today's team activity summary."""
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == code.upper())
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    today = datetime.now(timezone.utc).date()

    # Aggregate today's sessions for this team
    agg = await db.execute(
        select(
            func.count(LeagueSession.id).label("sessions"),
            func.coalesce(func.sum(LeagueSession.reps_counted), 0).label("reps"),
            func.coalesce(func.sum(LeagueSession.points_earned), 0).label("points"),
            func.count(func.distinct(LeagueSession.player_id)).label("players"),
        )
        .where(
            LeagueSession.team_id == team.id,
            func.date(LeagueSession.created_at) == today,
        )
    )
    row = agg.one()

    return {
        "sessions_today": row.sessions,
        "reps_today": int(row.reps),
        "points_today": float(row.points),
        "active_players": row.players,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/sessions/start", response_model=StartSessionResponse)
async def start_session(
    body: StartSessionRequest,
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
):
    """Start a new league session (30-second blitz)."""
    player = await db.get(LeaguePlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    caps = await check_daily_caps(db, player_id)
    if not caps["can_play"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=caps["reason"],
        )

    # Generate a session identifier — league sessions don't need a row
    # in the `sessions` table. The WebSocket works without session_id
    # (it's optional), and the league stores its own data in league_sessions.
    session_id = _uuid.uuid4()

    return StartSessionResponse(
        session_id=session_id,
        reps_remaining_today=caps["reps_remaining"],
        sessions_remaining_today=caps["sessions_remaining"],
    )


@router.post(
    "/sessions/{session_id}/complete", response_model=CompleteSessionResponse
)
async def complete_session(
    session_id: UUID,
    body: CompleteSessionRequest,
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
):
    """Complete a league session and calculate Movement Points."""
    # Check for duplicate completion
    existing = await db.execute(
        select(LeagueSession).where(LeagueSession.session_id == session_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session already completed",
        )

    player = await db.get(LeaguePlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    # Validate non-empty rep scores
    if not body.rep_scores:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one rep score is required",
        )

    # Calculate points
    result = calculate_session_points(body.rep_scores)

    # Check daily cap for reps
    daily_log = await get_or_create_daily_log(db, player_id)
    reps_remaining = max(0, 50 - daily_log.reps_today)
    capped = result["reps_counted"] > reps_remaining
    if capped:
        # Recalculate with capped reps
        capped_scores = [
            s for s in body.rep_scores if s >= 30
        ][:reps_remaining]
        result = calculate_session_points(capped_scores)

    # Update streak first so multiplier reflects current session
    update_streak(player)

    # Apply streak multiplier to points
    streak_mult = get_streak_multiplier(player.current_streak)
    points_with_streak = round(result["points_earned"] * streak_mult, 2)

    # Create LeagueSession record with streak-multiplied points
    league_session = LeagueSession(
        session_id=session_id,
        player_id=player_id,
        team_id=player.team_id,
        mode="personal",
        reps_counted=result["reps_counted"],
        reps_total=result["reps_total"],
        avg_quality=result["avg_quality"],
        points_earned=points_with_streak,
        duration_sec=body.duration_sec,
        max_combo=result["max_combo"],
        perfect_reps=result["perfect_reps"],
        capped=capped,
    )
    db.add(league_session)

    # Update daily log
    daily_log.sessions_today += 1
    daily_log.reps_today += result["reps_counted"]
    daily_log.points_today += points_with_streak

    # Update player totals
    player.total_points += points_with_streak
    player.total_reps += result["reps_counted"]
    player.total_sessions += 1
    if points_with_streak > player.best_session_points:
        player.best_session_points = points_with_streak
    if result["avg_quality"] > player.best_quality:
        player.best_quality = result["avg_quality"]

    # Update rank
    new_rank = compute_rank(player.total_points)
    player.rank = new_rank

    # Update team totals if applicable
    if player.team_id:
        team = await db.get(LeagueTeam, player.team_id)
        if team:
            team.total_points += points_with_streak
            team.total_sessions += 1

    await db.flush()

    return CompleteSessionResponse(
        points_earned=points_with_streak,
        reps_counted=result["reps_counted"],
        reps_total=result["reps_total"],
        avg_quality=result["avg_quality"],
        max_combo=result["max_combo"],
        perfect_reps=result["perfect_reps"],
        total_points=player.total_points,
        rank=player.rank,
        current_streak=player.current_streak,
        streak_multiplier=streak_mult,
        capped=capped,
    )


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/me", response_model=PlayerProfileResponse)
async def get_profile(
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current player's profile."""
    player = await db.get(LeaguePlayer, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    team_name = None
    team_code = None
    if player.team_id:
        team = await db.get(LeagueTeam, player.team_id)
        if team:
            team_name = team.name
            team_code = team.code

    return PlayerProfileResponse(
        id=player.id,
        nickname=player.nickname,
        avatar_seed=player.avatar_seed,
        email=player.email,
        team_name=team_name,
        team_code=team_code,
        rank=player.rank,
        total_points=player.total_points,
        total_reps=player.total_reps,
        total_sessions=player.total_sessions,
        best_session_points=player.best_session_points,
        best_quality=player.best_quality,
        current_streak=player.current_streak,
        longest_streak=player.longest_streak,
        last_active_date=player.last_active_date,
        email_verified=player.email_verified,
        created_at=player.created_at,
    )


@router.get("/me/history", response_model=list[SessionHistoryEntry])
async def get_history(
    player_id: UUID = Depends(get_league_player_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get player's session history."""
    result = await db.execute(
        select(LeagueSession)
        .where(LeagueSession.player_id == player_id)
        .order_by(LeagueSession.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    sessions = result.scalars().all()

    return [
        SessionHistoryEntry(
            id=s.id,
            mode=s.mode,
            reps_counted=s.reps_counted,
            reps_total=s.reps_total,
            avg_quality=s.avg_quality,
            points_earned=s.points_earned,
            max_combo=s.max_combo,
            perfect_reps=s.perfect_reps,
            created_at=s.created_at,
        )
        for s in sessions
    ]


# ══════════════════════════════════════════════════════════════════════════════
# KIOSK PAIRING
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/kiosk/{team_code}/register", response_model=KioskRegisterResponse)
async def register_kiosk(
    team_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Register a kiosk device for a team. Called once on setup."""
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == team_code.upper())
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    kiosk_id = secrets.token_hex(8)
    _kiosk_registry[kiosk_id] = team_code.upper()

    logger.info("Kiosk registered: %s for team %s", kiosk_id, team_code)

    return KioskRegisterResponse(
        kiosk_id=kiosk_id,
        team_name=team.name,
        team_code=team.code,
    )


@router.get("/kiosk/{kiosk_id}/pending", response_model=KioskPendingResponse)
async def get_kiosk_pending(kiosk_id: str):
    """Kiosk polls this every 2s to check if a player is queued."""
    if kiosk_id not in _kiosk_registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    _clean_stale_entries(kiosk_id)
    queue = _kiosk_queue.get(kiosk_id, [])

    if not queue:
        return KioskPendingResponse(has_pending=False, queue_size=0)

    first = queue[0]
    return KioskPendingResponse(
        has_pending=True,
        player_id=first["player_id"],
        nickname=first["nickname"],
        queue_size=len(queue),
    )


@router.post("/kiosk/{kiosk_id}/join")
@limiter.limit("10/minute")
async def join_kiosk(
    request: Request,
    kiosk_id: str,
    body: KioskJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """Phone calls this after scanning QR. Creates/finds player and adds to queue."""
    team_code = _kiosk_registry.get(kiosk_id)
    if team_code is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    # Profanity check
    if not is_nickname_clean(body.nickname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That nickname is not allowed. Please choose another.",
        )

    # Find team
    result = await db.execute(
        select(LeagueTeam).where(LeagueTeam.code == team_code)
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    _clean_stale_entries(kiosk_id)

    # Check for duplicate nickname in queue or active
    queue = _kiosk_queue.get(kiosk_id, [])
    active = _kiosk_active.get(kiosk_id)

    for entry in queue:
        if entry["nickname"].lower() == body.nickname.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You're already in the queue!",
            )
    if active and active["nickname"].lower() == body.nickname.lower():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You're currently playing!",
        )

    # Find or create player
    result = await db.execute(
        select(LeaguePlayer).where(
            func.lower(LeaguePlayer.nickname) == body.nickname.lower(),
            LeaguePlayer.team_id == team.id,
        )
    )
    player = result.scalar_one_or_none()

    if player is None:
        player = LeaguePlayer(nickname=body.nickname, team_id=team.id)
        db.add(player)
        team.member_count += 1
        await db.flush()

    # Create JWT for the player
    from backend.routers.league_auth import _create_league_token

    token = _create_league_token(player.id)

    # Add to queue
    if kiosk_id not in _kiosk_queue:
        _kiosk_queue[kiosk_id] = []

    _kiosk_queue[kiosk_id].append({
        "player_id": player.id,
        "nickname": player.nickname,
        "access_token": token,
        "timestamp": time.time(),
    })

    queue_position = len(_kiosk_queue[kiosk_id])

    return {
        "status": "queued",
        "player_id": str(player.id),
        "nickname": player.nickname,
        "access_token": token,
        "queue_position": queue_position,
    }


@router.post("/kiosk/{kiosk_id}/session-started")
async def kiosk_session_started(kiosk_id: str):
    """Kiosk calls this to move first queued player to active state."""
    if kiosk_id not in _kiosk_registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    _clean_stale_entries(kiosk_id)
    queue = _kiosk_queue.get(kiosk_id, [])

    if queue:
        player = queue.pop(0)
        _kiosk_active[kiosk_id] = player
        return {
            "status": "ok",
            "access_token": player.get("access_token"),
        }

    _kiosk_active[kiosk_id] = None
    return {"status": "ok"}


@router.post("/kiosk/{kiosk_id}/session-complete")
async def kiosk_session_complete(
    kiosk_id: str,
    body: KioskSessionCompleteRequest,
):
    """Arena posts session results so the phone can retrieve them."""
    if kiosk_id not in _kiosk_registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    # Store results for phone polling (keyed by player_id string)
    _player_results[body.player_id] = {
        "points_earned": body.points_earned,
        "reps_counted": body.reps_counted,
        "reps_total": body.reps_total,
        "avg_quality": body.avg_quality,
        "max_combo": body.max_combo,
        "perfect_reps": body.perfect_reps,
        "total_points": body.total_points,
        "rank": body.rank,
        "current_streak": body.current_streak,
        "capped": body.capped,
        "timestamp": time.time(),
    }

    # Clear active player
    _kiosk_active[kiosk_id] = None

    # Check if there's a next player in queue
    _clean_stale_entries(kiosk_id)
    queue = _kiosk_queue.get(kiosk_id, [])

    return {
        "status": "ok",
        "has_next": len(queue) > 0,
    }


@router.get("/kiosk/{kiosk_id}/player/{player_id}/status")
async def get_kiosk_player_status(kiosk_id: str, player_id: str):
    """Phone polls this to check queue position, active status, or get results."""
    if kiosk_id not in _kiosk_registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    # Check if results are available
    result_data = _player_results.get(player_id)
    if result_data and time.time() - result_data["timestamp"] < _RESULT_TTL:
        return {
            "status": "completed",
            **{k: v for k, v in result_data.items() if k != "timestamp"},
        }

    # Check if currently active
    active = _kiosk_active.get(kiosk_id)
    if active and str(active["player_id"]) == player_id:
        return {"status": "active"}

    # Check queue position
    _clean_stale_entries(kiosk_id)
    queue = _kiosk_queue.get(kiosk_id, [])
    for i, entry in enumerate(queue):
        if str(entry["player_id"]) == player_id:
            return {
                "status": "queued",
                "queue_position": i + 1,
                "queue_size": len(queue),
            }

    return {"status": "unknown"}


@router.get("/kiosk/{kiosk_id}/queue")
async def get_kiosk_queue(kiosk_id: str):
    """Get the full queue for a kiosk with positions."""
    if kiosk_id not in _kiosk_registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kiosk not found")

    _clean_stale_entries(kiosk_id)
    queue = _kiosk_queue.get(kiosk_id, [])
    active = _kiosk_active.get(kiosk_id)

    return {
        "active": {
            "player_id": str(active["player_id"]),
            "nickname": active["nickname"],
        } if active else None,
        "queue": [
            {
                "position": i + 1,
                "player_id": str(e["player_id"]),
                "nickname": e["nickname"],
            }
            for i, e in enumerate(queue)
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL LEADERBOARD & STATS
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_global_leaderboard(
    period: str = Query("week", pattern="^(today|week|alltime)$"),
    db: AsyncSession = Depends(get_db),
):
    """Global leaderboard across all players."""
    query = (
        select(
            LeaguePlayer.id,
            LeaguePlayer.nickname,
            LeaguePlayer.avatar_seed,
            LeaguePlayer.rank,
            func.coalesce(func.sum(LeagueSession.points_earned), 0).label("total"),
        )
        .outerjoin(LeagueSession, LeagueSession.player_id == LeaguePlayer.id)
    )

    today_utc = datetime.now(timezone.utc).date()

    if period == "today":
        query = query.where(func.date(LeagueSession.created_at) == today_utc)
    elif period == "week":
        week_start = today_utc - timedelta(days=today_utc.weekday())
        query = query.where(func.date(LeagueSession.created_at) >= week_start)

    query = (
        query.group_by(
            LeaguePlayer.id,
            LeaguePlayer.nickname,
            LeaguePlayer.avatar_seed,
            LeaguePlayer.rank,
        )
        .order_by(func.coalesce(func.sum(LeagueSession.points_earned), 0).desc())
        .limit(50)
    )

    rows = (await db.execute(query)).all()

    return [
        LeaderboardEntry(
            position=i + 1,
            player_id=row.id,
            nickname=row.nickname,
            avatar_seed=row.avatar_seed,
            rank=row.rank,
            value=float(row.total),
            is_current_player=False,
        )
        for i, row in enumerate(rows)
    ]


@router.get("/stats", response_model=GlobalStatsResponse)
async def get_global_stats(db: AsyncSession = Depends(get_db)):
    """Global stats for the landing page ticker."""
    today = datetime.now(timezone.utc).date()

    # Today's squats
    squats_result = await db.execute(
        select(func.coalesce(func.sum(LeagueSession.reps_counted), 0)).where(
            func.date(LeagueSession.created_at) == today
        )
    )
    total_squats_today = int(squats_result.scalar_one())

    # Total players
    players_result = await db.execute(select(func.count(LeaguePlayer.id)))
    total_players = players_result.scalar_one()

    # Total teams
    teams_result = await db.execute(select(func.count(LeagueTeam.id)))
    total_teams = teams_result.scalar_one()

    return GlobalStatsResponse(
        total_squats_today=total_squats_today,
        total_players=total_players,
        total_teams=total_teams,
    )
