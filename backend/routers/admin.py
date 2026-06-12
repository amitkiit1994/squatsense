"""Founder/admin leads endpoint — protected by the X-Admin-Key header."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.contact import ContactInquiry
from backend.models.gym_inquiry import GymInquiry
from backend.models.payment_event import PaymentEvent
from backend.models.user import User
from backend.models.waitlist_email import WaitlistEmail
from backend.rate_limit import limiter
from backend.schemas.admin import (
    GYM_PIPELINE_STAGES,
    AdminLeadsResponse,
    ContactInquiryListItem,
    GymInquiryListItem,
    GymInquiryUpdateRequest,
    LeadCounts,
    PaymentEventListItem,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

_LATEST_LIMIT = 50
_PAYMENT_EVENTS_LIMIT = 20


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


# ── Helpers ─────────────────────────────────────────────────────────────────

def _gym_inquiry_item(row: GymInquiry) -> GymInquiryListItem:
    """Map a GymInquiry ORM row to its response schema."""
    return GymInquiryListItem(
        id=row.id,
        gym_name=row.gym_name,
        contact_name=row.contact_name,
        email=row.email,
        phone=row.phone,
        city=row.city,
        num_locations=row.num_locations,
        message=row.message,
        stage=row.stage,
        next_action=row.next_action,
        stage_updated_at=row.stage_updated_at,
        created_at=row.created_at,
    )


# ── Endpoints ───────────────────────────────────────────────────────────────

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
    payment_event_count = (
        await db.execute(select(func.count()).select_from(PaymentEvent))
    ).scalar_one()

    stage_rows = (
        await db.execute(
            select(GymInquiry.stage, func.count()).group_by(GymInquiry.stage)
        )
    ).all()
    stage_counts: dict[str, int] = {stage: 0 for stage in GYM_PIPELINE_STAGES}
    for stage, count in stage_rows:
        stage_counts[stage] = count

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
    payment_event_rows = (
        (
            await db.execute(
                select(PaymentEvent)
                .order_by(PaymentEvent.created_at.desc())
                .limit(_PAYMENT_EVENTS_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    logger.info(
        "[ADMIN] Leads requested: gyms=%d contacts=%d waitlist=%d users=%d payments=%d",
        gym_count,
        contact_count,
        waitlist_count,
        user_count,
        payment_event_count,
    )

    return AdminLeadsResponse(
        counts=LeadCounts(
            gym_inquiries=gym_count,
            contact_inquiries=contact_count,
            waitlist_emails=waitlist_count,
            users=user_count,
            payment_events=payment_event_count,
        ),
        stage_counts=stage_counts,
        gym_inquiries=[_gym_inquiry_item(row) for row in gym_rows],
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
        payment_events=[
            PaymentEventListItem(
                id=row.id,
                source=row.source,
                event_type=row.event_type,
                razorpay_order_id=row.razorpay_order_id,
                razorpay_payment_id=row.razorpay_payment_id,
                plan_id=row.plan_id,
                billing=row.billing,
                amount=row.amount,
                currency=row.currency,
                payer_email=row.payer_email,
                created_at=row.created_at,
            )
            for row in payment_event_rows
        ],
    )


@router.patch(
    "/leads/gym/{inquiry_id}",
    response_model=GymInquiryListItem,
    summary="Update a gym inquiry's pipeline stage / next action",
    dependencies=[Depends(_require_admin_key)],
)
@limiter.limit("60/minute")
async def update_gym_inquiry(
    request: Request,
    inquiry_id: uuid.UUID,
    payload: GymInquiryUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> GymInquiryListItem:
    """Partially update pipeline fields on a gym inquiry.

    ``stage`` transitions also bump ``stage_updated_at``. ``next_action``
    may be set to null to clear it. Returns the updated row.
    """
    row = (
        await db.execute(select(GymInquiry).where(GymInquiry.id == inquiry_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gym inquiry not found",
        )

    if payload.stage is not None and payload.stage != row.stage:
        row.stage = payload.stage
        row.stage_updated_at = datetime.now(timezone.utc)
    if "next_action" in payload.model_fields_set:
        row.next_action = payload.next_action

    await db.commit()
    await db.refresh(row)

    logger.info(
        "[ADMIN] Gym inquiry %s updated: stage=%s next_action=%s",
        row.id,
        row.stage,
        row.next_action,
    )
    return _gym_inquiry_item(row)
