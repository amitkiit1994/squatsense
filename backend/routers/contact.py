"""Office/enterprise contact inquiry endpoint — no auth required."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.deps import get_db
from backend.models.contact import ContactInquiry
from backend.rate_limit import limiter
from backend.schemas.contact import ContactRequest, ContactResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "",
    response_model=ContactResponse,
    summary="Submit an office/enterprise contact inquiry",
)
@limiter.limit("5/minute")
async def submit_contact_inquiry(
    request: Request,
    body: ContactRequest,
    db: AsyncSession = Depends(get_db),
) -> ContactResponse:
    """Persist an office/enterprise inquiry for follow-up by the team.

    Contact details (name, email) are stored in the database only;
    logs carry non-personal business fields.
    """
    inquiry = ContactInquiry(
        company_name=body.company_name,
        contact_name=body.contact_name,
        email=body.email,
        number_of_offices=body.number_of_offices,
        estimated_employees=body.estimated_employees,
        message=body.message,
    )
    db.add(inquiry)
    await db.commit()

    logger.info(
        "[CONTACT] Stored inquiry id=%s company=%s offices=%s employees=%s",
        inquiry.id,
        body.company_name,
        body.number_of_offices,
        body.estimated_employees,
    )
    return ContactResponse()
