"""Tests for the office/enterprise contact inquiry endpoint.

Covers: successful submission (minimal and full payloads), validation
failures, and persistence to the contact_inquiries table.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.contact import ContactInquiry


async def test_submit_contact_minimal(client: AsyncClient, db: AsyncSession) -> None:
    """POST /api/v1/contact accepts the minimal required fields."""
    resp = await client.post(
        "/api/v1/contact",
        json={
            "company_name": "Acme Corp",
            "contact_name": "Jane Smith",
            "email": "jane@acme.com",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}

    rows = (await db.execute(select(ContactInquiry))).scalars().all()
    assert len(rows) == 1
    assert rows[0].company_name == "Acme Corp"
    assert rows[0].email == "jane@acme.com"


async def test_submit_contact_full_payload(client: AsyncClient, db: AsyncSession) -> None:
    """POST /api/v1/contact accepts the full payload sent by /for-offices."""
    resp = await client.post(
        "/api/v1/contact",
        json={
            "company_name": "Globex",
            "contact_name": "Hank Scorpio",
            "email": "hank@globex.com",
            "number_of_offices": "2-5",
            "estimated_employees": "51-200",
            "message": "We want a kiosk in every break room.",
        },
    )
    assert resp.status_code == 200, resp.text

    rows = (await db.execute(select(ContactInquiry))).scalars().all()
    assert len(rows) == 1
    assert rows[0].number_of_offices == "2-5"
    assert rows[0].estimated_employees == "51-200"


async def test_submit_contact_invalid_email(client: AsyncClient) -> None:
    """POST /api/v1/contact rejects an invalid email address."""
    resp = await client.post(
        "/api/v1/contact",
        json={
            "company_name": "Acme Corp",
            "contact_name": "Jane Smith",
            "email": "not-an-email",
        },
    )
    assert resp.status_code == 422


async def test_submit_contact_missing_fields(client: AsyncClient) -> None:
    """POST /api/v1/contact rejects a payload missing required fields."""
    resp = await client.post("/api/v1/contact", json={"email": "jane@acme.com"})
    assert resp.status_code == 422
