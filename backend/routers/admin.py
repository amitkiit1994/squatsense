"""Founder/admin leads endpoint — protected by the X-Admin-Key header."""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.contact import ContactInquiry
from backend.models.gym_inquiry import GymInquiry
from backend.models.user import User
from backend.models.waitlist_email import WaitlistEmail
from backend.rate_limit import limiter
from backend.schemas.admin import (
    AdminLeadsResponse,
    ContactInquiryListItem,
    GymInquiryListItem,
    LeadCounts,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

_LATEST_LIMIT = 50


# ── Auth ────────────────────────────────────────────────────────────────────

async def _require_admin_key(
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> None:
    """Validate the X-Admin-Key header against the ADMIN_API_KEY setting.

    503 when ADMIN_API_KEY is unset (admin endpoints disabled); 401 on a
    missing or wrong key.  Uses a constant-time compare to avoid leaking
    key material through timing side channels.
    """
    if not settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin_disabled",
        )
    if x_admin_key is None or not secrets.compare_digest(
        x_admin_key, settings.ADMIN_API_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin key",
        )


# ── Endpoint ────────────────────────────────────────────────────────────────

@router.get(
    "/leads",
    response_model=AdminLeadsResponse,
    summary="Founder leads overview",
    dependencies=[Depends(_require_admin_key)],
)
@limiter.limit("30/minute")
async def get_leads(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminLeadsResponse:
    """Return lead counts plus the latest gym and contact inquiries."""
    gym_count = (
        await db.execute(select(func.count()).select_from(GymInquiry))
    ).scalar_one()
    contact_count = (
        await db.execute(select(func.count()).select_from(ContactInquiry))
    ).scalar_one()
    waitlist_count = (
        await db.execute(select(func.count()).select_from(WaitlistEmail))
    ).scalar_one()
    user_count = (
        await db.execute(select(func.count()).select_from(User))
    ).scalar_one()

    gym_rows = (
        (
            await db.execute(
                select(GymInquiry)
                .order_by(GymInquiry.created_at.desc())
                .limit(_LATEST_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    contact_rows = (
        (
            await db.execute(
                select(ContactInquiry)
                .order_by(ContactInquiry.created_at.desc())
                .limit(_LATEST_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    logger.info(
        "[ADMIN] Leads requested: gyms=%d contacts=%d waitlist=%d users=%d",
        gym_count,
        contact_count,
        waitlist_count,
        user_count,
    )

    return AdminLeadsResponse(
        counts=LeadCounts(
            gym_inquiries=gym_count,
            contact_inquiries=contact_count,
            waitlist_emails=waitlist_count,
            users=user_count,
        ),
        gym_inquiries=[
            GymInquiryListItem(
                id=row.id,
                gym_name=row.gym_name,
                contact_name=row.contact_name,
                email=row.email,
                phone=row.phone,
                city=row.city,
                num_locations=row.num_locations,
                message=row.message,
                created_at=row.created_at,
            )
            for row in gym_rows
        ],
        contact_inquiries=[
            ContactInquiryListItem(
                id=row.id,
                company_name=row.company_name,
                contact_name=row.contact_name,
                email=row.email,
                number_of_offices=row.number_of_offices,
                estimated_employees=row.estimated_employees,
                message=row.message,
                created_at=row.created_at,
            )
            for row in contact_rows
        ],
    )
