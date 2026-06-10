"""Tests for the founder/admin leads endpoint.

Covers: 503 when ADMIN_API_KEY is unset, 401 on missing/wrong key, and
200 with correct counts and latest-first inquiry lists when the key matches.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.contact import ContactInquiry
from backend.models.gym_inquiry import GymInquiry
from backend.models.payment_event import PaymentEvent
from backend.models.user import User
from backend.models.waitlist_email import WaitlistEmail

_ADMIN_KEY = "test-admin-key-for-leads-endpoint"
_BASE_TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


async def test_leads_disabled_when_key_unset(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads returns 503 when ADMIN_API_KEY is empty."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "")
    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": "anything"}
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "admin_disabled"


async def test_leads_missing_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads returns 401 when no X-Admin-Key is sent."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    resp = await client.get("/api/v1/admin/leads")
    assert resp.status_code == 401


async def test_leads_wrong_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads returns 401 on a wrong X-Admin-Key."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": "wrong-key"}
    )
    assert resp.status_code == 401


async def test_leads_empty_database(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads returns zero counts and empty lists."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)
    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["counts"] == {
        "gym_inquiries": 0,
        "contact_inquiries": 0,
        "waitlist_emails": 0,
        "users": 0,
        "payment_events": 0,
    }
    assert data["gym_inquiries"] == []
    assert data["contact_inquiries"] == []
    assert data["payment_events"] == []


async def test_leads_counts_and_ordering(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads returns correct counts and newest-first lists."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)

    for i in range(3):
        db.add(
            GymInquiry(
                gym_name=f"Gym {i}",
                contact_name=f"Owner {i}",
                email=f"owner{i}@gym.com",
                phone="555-0100",
                city="Bengaluru",
                num_locations=i + 1,
                message=f"Inquiry {i}",
                created_at=_BASE_TS + timedelta(minutes=i),
            )
        )
    for i in range(2):
        db.add(
            ContactInquiry(
                company_name=f"Company {i}",
                contact_name=f"Contact {i}",
                email=f"contact{i}@company.com",
                number_of_offices="2-5",
                estimated_employees="51-200",
                message=f"Contact {i}",
                created_at=_BASE_TS + timedelta(minutes=i),
            )
        )
    db.add(WaitlistEmail(email="wait1@example.com"))
    db.add(WaitlistEmail(email="wait2@example.com"))
    db.add(User(email="user1@example.com"))
    db.add(
        PaymentEvent(
            source="traqgym-cloud",
            event_type="payment.captured",
            razorpay_order_id="order_test123",
            razorpay_payment_id="pay_test123",
            plan_id="growth",
            billing="monthly",
            amount=499900,
            currency="INR",
            payer_email="owner@gym.com",
            created_at=_BASE_TS,
        )
    )
    await db.commit()

    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["counts"] == {
        "gym_inquiries": 3,
        "contact_inquiries": 2,
        "waitlist_emails": 2,
        "users": 1,
        "payment_events": 1,
    }

    # Newest first
    assert [g["gym_name"] for g in data["gym_inquiries"]] == [
        "Gym 2",
        "Gym 1",
        "Gym 0",
    ]
    assert [c["company_name"] for c in data["contact_inquiries"]] == [
        "Company 1",
        "Company 0",
    ]

    # Field completeness on a gym inquiry row
    newest_gym = data["gym_inquiries"][0]
    assert newest_gym["contact_name"] == "Owner 2"
    assert newest_gym["email"] == "owner2@gym.com"
    assert newest_gym["phone"] == "555-0100"
    assert newest_gym["city"] == "Bengaluru"
    assert newest_gym["num_locations"] == 3
    assert newest_gym["message"] == "Inquiry 2"
    assert newest_gym["id"]
    assert newest_gym["created_at"]

    # Field completeness on a contact inquiry row
    newest_contact = data["contact_inquiries"][0]
    assert newest_contact["contact_name"] == "Contact 1"
    assert newest_contact["email"] == "contact1@company.com"
    assert newest_contact["number_of_offices"] == "2-5"
    assert newest_contact["estimated_employees"] == "51-200"
    assert newest_contact["message"] == "Contact 1"

    # Field completeness on a payment event row
    assert len(data["payment_events"]) == 1
    event = data["payment_events"][0]
    assert event["source"] == "traqgym-cloud"
    assert event["event_type"] == "payment.captured"
    assert event["razorpay_order_id"] == "order_test123"
    assert event["razorpay_payment_id"] == "pay_test123"
    assert event["plan_id"] == "growth"
    assert event["billing"] == "monthly"
    assert event["amount"] == 499900
    assert event["currency"] == "INR"
    assert event["payer_email"] == "owner@gym.com"
    assert event["id"]
    assert event["created_at"]


async def test_leads_lists_capped_at_50(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/v1/admin/leads caps lists at 50 while counts stay exact."""
    monkeypatch.setattr(settings, "ADMIN_API_KEY", _ADMIN_KEY)

    for i in range(55):
        db.add(
            GymInquiry(
                gym_name=f"Gym {i}",
                contact_name=f"Owner {i}",
                email=f"owner{i}@gym.com",
                created_at=_BASE_TS + timedelta(minutes=i),
            )
        )
    await db.commit()

    resp = await client.get(
        "/api/v1/admin/leads", headers={"X-Admin-Key": _ADMIN_KEY}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["counts"]["gym_inquiries"] == 55
    assert len(data["gym_inquiries"]) == 50
    assert data["gym_inquiries"][0]["gym_name"] == "Gym 54"
    assert data["gym_inquiries"][-1]["gym_name"] == "Gym 5"
