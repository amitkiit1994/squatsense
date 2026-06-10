"""Internal payment events endpoint — protected by the X-Internal-Key header.

Trusted services (e.g. traqgym-cloud) report Razorpay payment lifecycle
events here for persistence. Successful payments trigger a fire-and-forget
receipt email to the payer when Resend is configured.
"""

from __future__ import annotations

import asyncio
import html
import logging
import secrets

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.deps import get_db
from backend.models.payment_event import PaymentEvent
from backend.rate_limit import limiter
from backend.schemas.payment_event import PaymentEventCreate, PaymentEventResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payment-events", tags=["payment-events"])

_RECEIPT_EVENT_TYPES = {"payment.verified", "payment.captured"}
_RECEIPT_SUBJECT = "TraqGym Cloud - payment received (test mode)"


# ── Auth ────────────────────────────────────────────────────────────────────

async def _require_internal_key(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> None:
    """Validate the X-Internal-Key header against the INTERNAL_API_KEY setting.

    503 when INTERNAL_API_KEY is unset (internal endpoints disabled); 401 on
    a missing or wrong key.  Uses a constant-time compare to avoid leaking
    key material through timing side channels.
    """
    if not settings.INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="internal_disabled",
        )
    if x_internal_key is None or not secrets.compare_digest(
        x_internal_key, settings.INTERNAL_API_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal key",
        )


# ── Receipt email helper ────────────────────────────────────────────────────

def _build_receipt_html(body: PaymentEventCreate) -> str:
    def esc(value: str | int | None) -> str:
        return html.escape(str(value)) if value is not None else "-"

    amount_line = (
        f"INR {body.amount / 100:,.2f}" if body.amount is not None else "-"
    )
    return f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; margin: 0 0 16px;">Payment received (test mode)</h2>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        We recorded your test-mode payment for TraqGym Cloud. No real money
        moved - Razorpay is running in test mode while we finish onboarding.
      </p>
      <table style="font-size: 14px; line-height: 1.7; border-collapse: collapse;">
        <tr><td style="padding-right: 12px; color: #71717a;">Plan</td><td>{esc(body.plan_id)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Billing</td><td>{esc(body.billing)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Amount</td><td>{html.escape(amount_line)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Order</td><td>{esc(body.razorpay_order_id)}</td></tr>
        <tr><td style="padding-right: 12px; color: #71717a;">Payment</td><td>{esc(body.razorpay_payment_id)}</td></tr>
      </table>
      <p style="font-size: 14px; line-height: 1.6; margin: 16px 0 0;">
        A GST invoice will be issued when TraqGym Cloud reaches general
        availability. We will be in touch before anything is charged for real.
      </p>
    </div>
    """


async def _send_receipt_email(body: PaymentEventCreate) -> None:
    """Send a test-mode payment receipt to the payer via Resend HTTP API."""
    if not settings.RESEND_API_KEY:
        logger.warning(
            "[PAYMENT-EVENTS] RESEND_API_KEY not configured. Skipping receipt for order=%s",
            body.razorpay_order_id,
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
                    "to": [body.payer_email],
                    "subject": _RECEIPT_SUBJECT,
                    "html": _build_receipt_html(body),
                },
                timeout=10.0,
            )
        if resp.status_code == 200:
            logger.info(
                "[PAYMENT-EVENTS] Receipt sent for order=%s (id=%s)",
                body.razorpay_order_id,
                resp.json().get("id"),
            )
        else:
            logger.error(
                "[PAYMENT-EVENTS] Resend API error %s: %s",
                resp.status_code,
                resp.text,
            )
    except Exception:
        logger.exception(
            "[PAYMENT-EVENTS] Failed to send receipt for order=%s",
            body.razorpay_order_id,
        )


def _fire_and_forget_receipt(body: PaymentEventCreate) -> None:
    """Schedule the payer receipt email as a fire-and-forget background task."""
    task = asyncio.create_task(_send_receipt_email(body))
    task.add_done_callback(
        lambda t: logger.exception(
            "Payment receipt task failed", exc_info=t.exception()
        )
        if t.exception()
        else None
    )


# ── Endpoint ────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=PaymentEventResponse,
    summary="Record a payment lifecycle event",
    dependencies=[Depends(_require_internal_key)],
)
@limiter.limit("60/minute")
async def record_payment_event(
    request: Request,
    body: PaymentEventCreate,
    db: AsyncSession = Depends(get_db),
) -> PaymentEventResponse:
    """Persist a payment event and email a receipt for successful payments.

    Payer email is stored in the database and used for the receipt; logs
    carry only non-personal payment identifiers.
    """
    event = PaymentEvent(
        source=body.source,
        event_type=body.event_type,
        razorpay_order_id=body.razorpay_order_id,
        razorpay_payment_id=body.razorpay_payment_id,
        plan_id=body.plan_id,
        billing=body.billing,
        amount=body.amount,
        currency=body.currency,
        payer_email=body.payer_email,
        raw=body.raw,
    )
    db.add(event)
    await db.commit()

    logger.info(
        "[PAYMENT-EVENTS] Stored event id=%s source=%s type=%s order=%s payment=%s",
        event.id,
        body.source,
        body.event_type,
        body.razorpay_order_id,
        body.razorpay_payment_id,
    )

    if body.event_type in _RECEIPT_EVENT_TYPES and body.payer_email:
        _fire_and_forget_receipt(body)

    return PaymentEventResponse(id=event.id)
