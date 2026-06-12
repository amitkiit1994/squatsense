"""Tests for the gym inquiry pipeline CRM endpoints.

Covers: PATCH /api/v1/admin/leads/gym/{id} auth (503/401), validation
(unknown id, bad stage, empty body), stage transitions bumping
stage_updated_at, next_action set/clear, and the stage_counts dict on
GET /api/v1/admin/leads.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.gym_inquiry import GymInquiry

_ADMIN_KEY = "test-admin-key-for-pipeline-endpoint"
_BASE_TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

_ALL_STAGES = ("new", "contacted", "demo", "trial", "won", "lost")


async def _create_inquiry(db: AsyncSession, **overrides) -> GymInquiry:
    """Insert a gym inquiry with sensible defaults and return it."""
    fields = {
        "gym_name": "Iron Temple",
        "contact_name": "Asha Rao",
        "email": "asha@irontemple.in",
        "phone": "555-0100",
        "city": "Mumbai",
        "num_locations": 1,
        "message": "Interested in a demo",
        "created_at": _BASE_TS,
    }
    fields.update(overrides)
    row = GymInquiry(**fields)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ── Auth ────────────────────────────────────────────────────────────────────

async def test_patch_disabled_when_key_unset(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH returns 503 when ADMIN_API_KEY is empty."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "")
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "contacted"},
        headers={"X-Admin-Key": "anything"},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "admin_disabled"


async def test_patch_missing_key(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH returns 401 when no X-Admin-Key is sent."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}", json={"stage": "contacted"}
    )
    assert resp.status_code == 401


async def test_patch_wrong_key(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH returns 401 on a wrong X-Admin-Key."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "contacted"},
        headers={"X-Admin-Key": "wrong-key"},
    )
    assert resp.status_code == 401


# ── Validation ──────────────────────────────────────────────────────────────

async def test_patch_unknown_id_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH returns 404 for a well-formed but unknown inquiry id."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    resp = await client.patch(
        "/api/v1/admin/leads/gym/00000000-0000-0000-0000-000000000000",
        json={"stage": "contacted"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Gym inquiry not found"


async def test_patch_invalid_stage_returns_422(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH rejects stages outside new|contacted|demo|trial|won|lost."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "negotiating"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 422


async def test_patch_empty_body_returns_422(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH requires at least one of stage / next_action."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 422


async def test_patch_overlong_next_action_returns_422(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH rejects next_action longer than 255 characters."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)
    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"next_action": "x" * 256},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 422


# ── Stage transitions ───────────────────────────────────────────────────────

async def test_new_inquiry_defaults_to_stage_new(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Rows created without an explicit stage start at 'new'."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    await _create_inquiry(db)
    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    item = resp.json()["gym_inquiries"][0]
    assert item["stage"] == "new"
    assert item["next_action"] is None
    assert item["stage_updated_at"] is None


async def test_patch_stage_transition_updates_row(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH with a stage moves the lead and bumps stage_updated_at."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "contacted"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == str(row.id)
    assert body["stage"] == "contacted"
    assert body["stage_updated_at"] is not None
    # Untouched fields are preserved in the response
    assert body["gym_name"] == "Iron Temple"
    assert body["email"] == "asha@irontemple.in"
    assert body["next_action"] is None

    # Persisted in the database
    fresh = (
        await db.execute(select(GymInquiry).where(GymInquiry.id == row.id))
    ).scalar_one()
    await db.refresh(fresh)
    assert fresh.stage == "contacted"
    assert fresh.stage_updated_at is not None


async def test_patch_same_stage_does_not_bump_timestamp(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Re-sending the current stage is a no-op for stage_updated_at."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "new"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "new"
    assert resp.json()["stage_updated_at"] is None


async def test_patch_next_action_set_and_clear(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH can set next_action without touching stage, and clear it."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"next_action": "Call Thursday 5pm"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["next_action"] == "Call Thursday 5pm"
    assert body["stage"] == "new"
    assert body["stage_updated_at"] is None  # stage untouched

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"next_action": None},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["next_action"] is None


async def test_patch_stage_and_next_action_together(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PATCH applies both fields in a single request."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "demo", "next_action": "Demo at eGym Lokhandwala"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stage"] == "demo"
    assert body["next_action"] == "Demo at eGym Lokhandwala"
    assert body["stage_updated_at"] is not None


# ── Stage counts on GET /admin/leads ────────────────────────────────────────

async def test_stage_counts_empty_database(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /admin/leads always includes all six stages, zeroed when empty."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["stage_counts"] == {stage: 0 for stage in _ALL_STAGES}


async def test_stage_counts_reflect_stages(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /admin/leads counts gym inquiries per pipeline stage."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)

    stages = ["new", "new", "contacted", "demo", "won", "won", "lost"]
    for i, stage in enumerate(stages):
        await _create_inquiry(
            db,
            gym_name=f"Gym {i}",
            email=f"owner{i}@gym.com",
            stage=stage,
            created_at=_BASE_TS + timedelta(minutes=i),
        )

    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["stage_counts"] == {
        "new": 2,
        "contacted": 1,
        "demo": 1,
        "trial": 0,
        "won": 2,
        "lost": 1,
    }
    # Stage counts cover the same rows the gym_inquiries count does
    assert sum(data["stage_counts"].values()) == data["counts"]["gym_inquiries"]


async def test_stage_counts_update_after_patch(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stage PATCH is reflected in stage_counts on the next GET."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    row = await _create_inquiry(db)

    resp = await client.patch(
        f"/api/v1/admin/leads/gym/{row.id}",
        json={"stage": "won"},
        headers={"X-Admin-Key": _ADMIN_KEY},
    )
    assert resp.status_code == 200, resp.text

    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    counts = resp.json()["stage_counts"]
    assert counts["won"] == 1
    assert counts["new"] == 0
