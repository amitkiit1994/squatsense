"""Gym inquiry (B2B) endpoint — no auth required."""

from __future__ import annotations

import asyncio
import html
import logging

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.gym_inquiry import GymInquiry
from backend.rate_limit import limiter
from backend.schemas.gym_inquiry import GymInquiryRequest, GymInquiryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gym-inquiry", tags=["gym-inquiry"])


# ---------------------------------------------------------------------------
# Team notification helper
# ---------------------------------------------------------------------------

def _build_notification_html(body: GymInquiryRequest) -> str:
    def esc(value: str | int | None) -> str:
        return html.escape(str(value)) if value is not None else "-"

    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; margin: 0 0 16px;">New gym inquiry</h2>
      <table style="font-size: 14px; line-height: 1.7; border-collapse: collapse;">
        <tr><td style="padding-right: 12px; color: #71717a;">Gym</td><td>{esc(body.gym_name)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Contact</td><td>{esc(body.contact_name)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Email</td><td>{esc(body.email)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Phone</td><td>{esc(body.phone)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">City</td><td>{esc(body.city)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Locations</td><td>{esc(body.num_locations)}</td></tr>
      </table>
      <p style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 16px 0 0;">{esc(body.message)}</p>
    </div>
    """


async def _send_inquiry_notification(body: GymInquiryRequest) -> None:
    """Notify the team about a new gym inquiry via Resend HTTP API."""
    if not settings.RESEND_API_KEY:
        logger.warning(
            "[GYM-INQUIRY] RESEND_API_KEY not configured. Skipping notification for gym=%s",
            body.gym_name,
        )
        return

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                settings.RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
                    "to": [settings.GYM_INQUIRY_NOTIFY_EMAIL],
                    "subject": f"New gym inquiry: {body.gym_name}",
                    "html": _build_notification_html(body),
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info(
                "[GYM-INQUIRY] Notification sent to %s (id=%s)",
                settings.GYM_INQUIRY_NOTIFY_EMAIL,
                resp.json().get("id"),
            )
        else:
            logger.error("[GYM-INQUIRY] Resend API error %s: %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("[GYM-INQUIRY] Failed to send notification for gym=%s", body.gym_name)


def _fire_and_forget_notification(body: GymInquiryRequest) -> None:
    """Schedule the team notification as a fire-and-forget background task."""
    task = asyncio.create_task(_send_inquiry_notification(body))
    task.add_done_callback(
        lambda t: logger.exception(
            "Gym inquiry notification task failed", exc_info=t.exception()
        )
        if t.exception()
        else None
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

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
    """Persist a B2B gym inquiry and notify the team for follow-up.

    Contact details (name, email, phone) are stored in the database and sent
    to the team notification address; logs carry non-personal business fields.
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

    _fire_and_forget_notification(body)

    return GymInquiryResponse()
