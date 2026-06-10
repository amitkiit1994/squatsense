"""Gym inquiry (B2B) endpoint — no auth required."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.deps import get_db
from backend.models.gym_inquiry import GymInquiry
from backend.rate_limit import limiter
from backend.schemas.gym_inquiry import GymInquiryRequest, GymInquiryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gym-inquiry", tags=["gym-inquiry"])


@router.post(
    "",
    response_model=GymInquiryResponse,
    summary="Submit a B2B gym inquiry",
)
@limiter.limit("5/minute")
async def submit_gym_inquiry(
    request: Request,
    body: GymInquiryRequest,
    db: AsyncSession = Depends(get_db),
) -> GymInquiryResponse:
    """Persist a B2B gym inquiry for follow-up by the team.

    Contact details (name, email, phone) are stored in the database only;
    logs carry non-personal business fields.
    """
    inquiry = GymInquiry(
        gym_name=body.gym_name,
        contact_name=body.contact_name,
        email=body.email,
        phone=body.phone,
        city=body.city,
        num_locations=body.num_locations,
        message=body.message,
    )
    db.add(inquiry)
    await db.commit()

    logger.info(
        "[GYM-INQUIRY] Stored inquiry id=%s gym=%s city=%s locations=%s",
        inquiry.id,
        body.gym_name,
        body.city,
        body.num_locations,
    )
    return GymInquiryResponse()
