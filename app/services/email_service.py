"""Transactional email via Resend (https://resend.com).

The Resend SDK is synchronous (it uses ``requests`` under the hood), so callers
in async request handlers must invoke :func:`send_payslip_email` through a
threadpool (e.g. ``fastapi.concurrency.run_in_threadpool``) to avoid blocking
the event loop.

Credentials come from the environment via ``Settings`` — set ``RESEND_API_KEY``
and ``RESEND_FROM_EMAIL`` in ``.env`` (see ``.env.sample``). When the API key is
unset, :class:`EmailNotConfigured` is raised so the API can return a clear 503
instead of a cryptic SDK error.
"""
from typing import Any
from xml.sax.saxutils import escape

import resend

from app.core.settings import Settings

_settings = Settings()


class EmailNotConfiguredError(RuntimeError):
    """Raised when an email send is attempted without RESEND_API_KEY set."""


def is_configured() -> bool:
    """Return True when a Resend API key and sender address are both available."""
    return bool(_settings.resend_api_key and _settings.resend_from_email)


def _from_address() -> str:
    name = _settings.resend_from_name.strip()
    email = _settings.resend_from_email.strip()
    return f"{name} <{email}>" if name else email


def payslip_email_html(*, employee_name: str, company_name: str, period: str, net_pay: str) -> str:
    """Minimal, inline-styled HTML body for the payslip email."""
    name = escape(employee_name or "there")
    company = escape(company_name)
    period_s = escape(period)
    net = escape(net_pay)
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px;margin:0 auto">
  <h2 style="margin:0 0 4px">{company}</h2>
  <p style="color:#6b7280;margin:0 0 20px">Payslip</p>
  <p>Hi {name},</p>
  <p>Your payslip for <strong>{period_s}</strong> is ready. The full breakdown is
  attached as a PDF.</p>
  <p style="font-size:18px"><strong>Net Payable: {net}</strong></p>
  <p style="color:#6b7280;font-size:13px;margin-top:24px">
    This is an automated message from {company}. If you have questions about your
    pay, please contact your HR/payroll team.
  </p>
</div>"""


def send_payslip_email(
    *,
    to_email: str,
    subject: str,
    html: str,
    pdf_bytes: bytes,
    filename: str,
) -> Any:
    """Send a payslip email with the PDF attached; return the Resend response.

    Raises:
        EmailNotConfiguredError: when RESEND_API_KEY / RESEND_FROM_EMAIL are unset.
        Exception: any error surfaced by the Resend SDK (network / API failure).

    """
    if not is_configured():
        raise EmailNotConfiguredError(
            "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in the environment."
        )

    resend.api_key = _settings.resend_api_key
    params: resend.Emails.SendParams = {
        "from": _from_address(),
        "to": [to_email],
        "subject": subject,
        "html": html,
        # Resend's Python SDK accepts attachment content as a list of bytes.
        "attachments": [{"filename": filename, "content": list(pdf_bytes)}],
    }
    return resend.Emails.send(params)
