"""Server-side payslip PDF rendering.

Uses fpdf2 (pure-Python, no system/native deps — portable on Windows). The
output is the single source of truth for both the "Download PDF" endpoint and
the payslip email attachment, so what an employee downloads matches what they
receive by email.

Note on currency: the built-in Helvetica font is latin-1 only and cannot render
the ₹ glyph, so amounts are formatted as ``INR 1,234.00`` (currency code +
amount) rather than with a symbol — portable across fonts and locales.
"""
from datetime import date
from decimal import Decimal
from typing import Any

from fpdf import FPDF
from fpdf.enums import Align, XPos, YPos

_PRIMARY = (37, 99, 235)  # accent used for headings / net pay
_MUTED = (107, 114, 128)
_LINE = (229, 231, 235)


def _money(amount: Any, currency: str) -> str:
    """Format an amount as ``<CURRENCY> 1,234.00`` (no symbol — font-safe)."""
    n = float(amount or 0)
    return f"{currency} {n:,.2f}"


def _fmt(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


class _PayslipPDF(FPDF):
    # header()/footer() are fpdf2 hooks called automatically on each page.
    def header(self) -> None:
        pass

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*_MUTED)
        self.cell(
            0,
            10,
            "This is a system-generated payslip and does not require a signature.",
            align=Align.C,
        )


def render_payslip_pdf(
    *,
    company_name: str,
    employee_name: str,
    employee_email: str,
    ref: str,
    period_start: Any,
    period_end: Any,
    pay_date: Any,
    status: str,
    earnings: list[dict[str, Any]],
    deductions: list[dict[str, Any]],
    gross: Decimal | float,
    total_deductions: Decimal | float,
    net: Decimal | float,
    lop_days: Any,
    paid_days: Any,
    working_days: int,
    currency: str = "INR",
    employer_contributions: list[dict[str, Any]] | None = None,
) -> bytes:
    """Render a single payslip to PDF bytes."""
    pdf = _PayslipPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    epw = pdf.epw  # effective page width (inside margins)

    # --- Header band: company (left) + PAYSLIP/ref (right) ---
    top = pdf.get_y()
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(epw / 2, 9, company_name, new_x=XPos.LEFT, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_MUTED)
    pdf.cell(epw / 2, 5, "Payslip", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(pdf.l_margin + epw / 2, top)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*_PRIMARY)
    pdf.cell(epw / 2, 9, "PAYSLIP", align=Align.R, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(pdf.l_margin + epw / 2)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_MUTED)
    pdf.cell(
        epw / 2,
        5,
        f"Ref #{ref}    Status: {status}",
        align=Align.R,
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.ln(4)
    _hr(pdf)
    pdf.ln(4)

    # --- Employee / period info grid ---
    _info_row(pdf, "Employee", employee_name, "Email", employee_email or "-")
    _info_row(pdf, "Period", f"{_fmt(period_start)}  to  {_fmt(period_end)}", "Pay Date", _fmt(pay_date))
    pdf.ln(4)

    # --- Earnings ---
    _section_table(pdf, "Earnings", earnings, currency, "Gross Earnings", gross)
    pdf.ln(3)
    # --- Deductions ---
    _section_table(
        pdf, "Deductions", deductions, currency, "Total Deductions", total_deductions, negative=True
    )
    pdf.ln(4)

    # --- Employer contributions (informational — not deducted from the employee) ---
    if employer_contributions:
        er_total = sum((Decimal(str(c.get("amount") or 0)) for c in employer_contributions), Decimal("0"))
        _section_table(
            pdf,
            "Employer Contributions (not deducted)",
            employer_contributions,
            currency,
            "Total Employer Cost",
            er_total,
        )
        pdf.ln(4)

    # --- Attendance ---
    _info_row(
        pdf,
        "Working Days",
        _fmt(working_days),
        "LOP Days",
        _fmt(lop_days),
    )
    _info_row(pdf, "Paid Days", _fmt(paid_days), "", "")
    pdf.ln(4)
    _hr(pdf)
    pdf.ln(3)

    # --- Net payable ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(epw * 0.6, 10, "Net Payable", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_text_color(*_PRIMARY)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(epw * 0.4, 10, _money(net, currency), align=Align.R, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    return bytes(pdf.output())


def _hr(pdf: FPDF) -> None:
    pdf.set_draw_color(*_LINE)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.l_margin + pdf.epw, y)


def _info_row(pdf: FPDF, l1: str, v1: str, l2: str, v2: str) -> None:
    epw = pdf.epw
    col = epw / 2
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*_MUTED)
    pdf.cell(col, 4, l1.upper(), new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 4, l2.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(col, 5, v1, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(col, 5, v2, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)


def _section_table(
    pdf: FPDF,
    title: str,
    lines: list[dict[str, Any]],
    currency: str,
    total_label: str,
    total: Decimal | float,
    *,
    negative: bool = False,
) -> None:
    epw = pdf.epw
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 7, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    _hr(pdf)
    pdf.ln(1)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(40, 40, 40)
    sign = "- " if negative else ""
    if not lines:
        pdf.set_text_color(*_MUTED)
        pdf.cell(0, 6, "None", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    for line in lines:
        label = str(line.get("label") or line.get("code") or "")
        amount = _money(line.get("amount"), currency)
        pdf.cell(epw * 0.7, 6, label, new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(epw * 0.3, 6, f"{sign}{amount}", align=Align.R, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(epw * 0.7, 6, total_label, new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(
        epw * 0.3,
        6,
        f"{sign}{_money(total, currency)}",
        align=Align.R,
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
