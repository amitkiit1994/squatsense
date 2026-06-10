"""Tests for the internal payment events endpoint.

Covers: 503 when INTERNAL_API_KEY is unset, 401 on missing/wrong key,
200 with persistence, schema validation, receipt-email triggering rules,
and the admin leads listing of payment events.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.payment_event import PaymentEvent

_INTERNAL_KEY = "test-internal-key-for-payment-events"
_ADMIN_KEY = "test-admin-key-for-payment-events"
_BASE_TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def _payload(**overrides: object) -> dict:
    payload: dict = {
        "source": "traqgym-cloud",
        "event_type": "payment.captured",
        "razorpay_order_id": "order_abc123",
        "razorpay_payment_id": "pay_abc123",
        "plan_id": "starter",
        "billing": "monthly",
        "amount": 399900,
        "currency": "INR",
        "payer_email": "payer@example.com",
        "raw": {"status": "captured"},
    }
    payload.update(overrides)
    return payload


# ── Auth ────────────────────────────────────────────────────────────────────

async def test_disabled_when_key_unset(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/v1/payment-events returns 503 when INTERNAL_API_KEY is empty."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", "")
    resp = await client.post(
        "/api/v1/payment-events",
        json=_payload(),
        headers={"X-Internal-Key": "anything"},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "internal_disabled"


async def test_missing_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/v1/payment-events returns 401 when no X-Internal-Key is sent."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    resp = await client.post("/api/v1/payment-events", json=_payload())
    assert resp.status_code == 401


async def test_wrong_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/v1/payment-events returns 401 on a wrong X-Internal-Key."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    resp = await client.post(
        "/api/v1/payment-events",
        json=_payload(),
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert resp.status_code == 401


# ── Persistence ─────────────────────────────────────────────────────────────

async def test_event_persisted(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /api/v1/payment-events persists the event and returns its ID."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    resp = await client.post(
        "/api/v1/payment-events",
        json=_payload(),
        headers={"X-Internal-Key": _INTERNAL_KEY},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ok"] is True
    assert data["id"]

    rows = (await db.execute(select(PaymentEvent))).scalars().all()
    assert len(rows) == 1
    event = rows[0]
    assert str(event.id) == data["id"]
    assert event.source == "traqgym-cloud"
    assert event.event_type == "payment.captured"
    assert event.razorpay_order_id == "order_abc123"
    assert event.razorpay_payment_id == "pay_abc123"
    assert event.plan_id == "starter"
    assert event.billing == "monthly"
    assert event.amount == 399900
    assert event.currency == "INR"
    assert event.payer_email == "payer@example.com"
    assert event.created_at is not None


async def test_minimal_event_persisted(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Optional fields may be omitted; currency defaults to INR."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    resp = await client.post(
        "/api/v1/payment-events",
        json={
            "source": "traqgym-cloud",
            "event_type": "payment.verified",
            "razorpay_order_id": "order_min1",
            "razorpay_payment_id": "pay_min1",
        },
        headers={"X-Internal-Key": _INTERNAL_KEY},
    )
    assert resp.status_code == 200, resp.text

    event = (await db.execute(select(PaymentEvent))).scalars().one()
    assert event.event_type == "payment.verified"
    assert event.plan_id is None
    assert event.billing is None
    assert event.amount is None
    assert event.currency == "INR"
    assert event.payer_email is None
    assert event.raw is None


async def test_invalid_event_type_rejected(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unknown event types are rejected with 422 and nothing is persisted."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    resp = await client.post(
        "/api/v1/payment-events",
        json=_payload(event_type="payment.unknown"),
        headers={"X-Internal-Key": _INTERNAL_KEY},
    )
    assert resp.status_code == 422

    rows = (await db.execute(select(PaymentEvent))).scalars().all()
    assert rows == []


async def test_missing_order_id_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A payload without razorpay_order_id is rejected with 422."""
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    payload = _payload()
    del payload["razorpay_order_id"]
    resp = await client.post(
        "/api/v1/payment-events",
        json=payload,
        headers={"X-Internal-Key": _INTERNAL_KEY},
    )
    assert resp.status_code == 422


# ── Receipt email triggering ────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("event_type", "payer_email", "expect_receipt"),
    [
        ("payment.captured", "payer@example.com", True),
        ("payment.verified", "payer@example.com", True),
        ("payment.failed", "payer@example.com", False),
        ("payment.captured", None, False),
    ],
)
async def test_receipt_triggering(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    event_type: str,
    payer_email: str | None,
    expect_receipt: bool,
) -> None:
    """Receipts fire only for verified/captured events with a payer email."""
    import backend.routers.payment_events as module

    monkeypatch.setattr(settings, "INTERNAL_API_KEY", _INTERNAL_KEY)
    calls: list[object] = []
    monkeypatch.setattr(
        module, "_fire_and_forget_receipt", lambda body: calls.append(body)
    )

    resp = await client.post(
        "/api/v1/payment-events",
        json=_payload(event_type=event_type, payer_email=payer_email),
        headers={"X-Internal-Key": _INTERNAL_KEY},
    )
    assert resp.status_code == 200, resp.text
    assert len(calls) == (1 if expect_receipt else 0)


# ── Admin listing ───────────────────────────────────────────────────────────

async def test_admin_leads_lists_payment_events(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads lists the latest 20 payment events, newest first."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)

    for i in range(25):
        db.add(
            PaymentEvent(
                source="traqgym-cloud",
                event_type="payment.captured",
                razorpay_order_id=f"order_{i}",
                razorpay_payment_id=f"pay_{i}",
                currency="INR",
                created_at=_BASE_TS + timedelta(minutes=i),
            )
        )
    await db.commit()

    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["counts"]["payment_events"] == 25
    assert len(data["payment_events"]) == 20
    assert data["payment_events"][0]["razorpay_order_id"] == "order_24"
    assert data["payment_events"][-1]["razorpay_order_id"] == "order_5"
