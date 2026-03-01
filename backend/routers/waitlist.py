"""Waitlist signup endpoint — no auth required."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.waitlist_email import WaitlistEmail
from backend.schemas.waitlist import WaitlistSignupRequest, WaitlistSignupResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------

def _build_welcome_email(to_email: str) -> MIMEMultipart:
    """Build the HTML thank-you email."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Welcome to the SquatSense.ai Waitlist!"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    text = (
        "Thanks for joining the SquatSense.ai waitlist!\n\n"
        "You're now in line for early access to AI-powered movement analysis "
        "that tracks joint angles, form scores, and fatigue — all from your "
        "phone camera.\n\n"
        "We'll email you as soon as we're ready to let you in.\n\n"
        "— The SquatSense.ai Team"
    )

    html = f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #e4e4e7; background-color: #18181b; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #a78bfa;">SquatSense.ai</h1>
      </div>
      <h2 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 16px;">You're on the list!</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px;">
        Thanks for joining the SquatSense.ai waitlist. You're now in line for early access to
        AI-powered movement analysis that tracks joint angles, form scores, and fatigue &mdash;
        all from your phone camera.
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 24px;">
        We'll email you as soon as we're ready to let you in. Early members get free access.
      </p>
      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="font-size: 12px; color: #52525b; margin: 0;">
          &copy; 2026 SquatSense.ai. All rights reserved.
        </p>
      </div>
    </div>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


def _send_email_sync(to_email: str) -> None:
    """Send the welcome email via SMTP (blocking, run in thread)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        return

    try:
        msg = _build_welcome_email(to_email)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            server.send_message(msg)
    except Exception:
        logger.exception("Failed to send welcome email to %s", to_email)


async def _send_welcome_email(to_email: str) -> None:
    """Send email in a background thread so the API response isn't blocked."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _send_email_sync, to_email)


def _fire_and_forget_email(to_email: str) -> None:
    """Schedule welcome email as a fire-and-forget background task."""
    task = asyncio.create_task(_send_welcome_email(to_email))
    task.add_done_callback(
        lambda t: logger.exception(
            "Welcome email task failed", exc_info=t.exception()
        )
        if t.exception()
        else None
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=WaitlistSignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Join the waitlist",
)
async def join_waitlist(
    body: WaitlistSignupRequest,
    db: AsyncSession = Depends(get_db),
) -> WaitlistSignupResponse:
    """Store an email signup and send a thank-you email."""
    # Check for duplicate
    result = await db.execute(
        select(WaitlistEmail).where(WaitlistEmail.email == body.email)
    )
    existing = result.scalars().first()
    if existing is not None:
        _fire_and_forget_email(existing.email)
        return WaitlistSignupResponse(
            email=existing.email,
            created_at=existing.created_at,
        )

    entry = WaitlistEmail(email=body.email)
    db.add(entry)
    await db.flush()

    _fire_and_forget_email(body.email)

    return WaitlistSignupResponse(
        email=entry.email,
        created_at=entry.created_at,
    )
