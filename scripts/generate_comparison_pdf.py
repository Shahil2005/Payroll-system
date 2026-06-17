"""Generate a PDF comparing Croar Payroll with RazorpayX Payroll.

Standalone, uses fpdf2 (already a project dependency). Run:
    python scripts/generate_comparison_pdf.py
Writes: data/Croar-vs-RazorpayX-Payroll.pdf
"""
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import Align, XPos, YPos

PRIMARY = (37, 99, 235)
DARK = (17, 24, 39)
MUTED = (107, 114, 128)
LINE = (229, 231, 235)
GREEN = (22, 163, 74)
RED = (220, 38, 38)
GREEN_BG = (236, 253, 245)
RED_BG = (254, 242, 242)
HEAD_BG = (243, 244, 246)

OUTPUT = Path("data") / "Croar-vs-RazorpayX-Payroll.pdf"


class PDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, "Croar Payroll  vs  RazorpayX Payroll", align=Align.R,
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 10, f"Page {self.page_no()}  -  Generated for internal review",
                  align=Align.C)


def h1(pdf: PDF, text: str) -> None:
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 9, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.4)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(3)


def para(pdf: PDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(0, 5.2, text)
    pdf.ln(1.5)


def bullet(pdf: PDF, title: str, body: str, color=DARK) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*color)
    pdf.cell(5, 5.2, "-", new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.cell(0, 5.2, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    if body:
        pdf.set_x(pdf.l_margin + 5)
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(*DARK)
        pdf.multi_cell(pdf.w - pdf.l_margin - pdf.r_margin - 5, 4.8, body)
    pdf.ln(1)


def feature_table(pdf: PDF, rows: list[tuple[str, str, str]]) -> None:
    """rows: (Area, RazorpayX, Croar/Yours)."""
    w_area, w_rp, w_us = 42, 70, 66
    line_h = 5.0

    def render_head() -> None:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(*HEAD_BG)
        pdf.set_text_color(*DARK)
        pdf.cell(w_area, 7, " Area", border=0, fill=True)
        pdf.cell(w_rp, 7, " RazorpayX Payroll", border=0, fill=True)
        pdf.cell(w_us, 7, " Croar (your app)", border=0, fill=True,
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    render_head()
    fill = False
    for area, rp, us in rows:
        pdf.set_font("Helvetica", "", 8.5)
        # measure height
        n_area = len(pdf.multi_cell(w_area, line_h, area, dry_run=True, output="LINES"))
        n_rp = len(pdf.multi_cell(w_rp, line_h, rp, dry_run=True, output="LINES"))
        n_us = len(pdf.multi_cell(w_us, line_h, us, dry_run=True, output="LINES"))
        rows_h = max(n_area, n_rp, n_us) * line_h + 1.5

        if pdf.get_y() + rows_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            render_head()

        x0, y0 = pdf.get_x(), pdf.get_y()
        pdf.set_fill_color(249, 250, 251) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.rect(x0, y0, w_area + w_rp + w_us, rows_h, style="F")

        pdf.set_text_color(*DARK)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.multi_cell(w_area, line_h, area, new_x=XPos.RIGHT, new_y=YPos.TOP, max_line_height=line_h)
        pdf.set_xy(x0 + w_area, y0 + 0.7)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(w_rp, line_h, rp, new_x=XPos.RIGHT, new_y=YPos.TOP, max_line_height=line_h)
        pdf.set_xy(x0 + w_area + w_rp, y0 + 0.7)
        pdf.set_text_color(*GREEN)
        pdf.multi_cell(w_us, line_h, us, max_line_height=line_h)

        pdf.set_xy(x0, y0 + rows_h)
        fill = not fill
    pdf.ln(4)


def gap_block(pdf: PDF, num: int, title: str, body: str) -> None:
    needed = 8 + 5 * (len(body) // 90 + 1)
    if pdf.get_y() + needed > pdf.h - pdf.b_margin:
        pdf.add_page()
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*RED)
    pdf.cell(0, 6, f"{num}.  {title}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(0, 4.9, body)
    pdf.ln(2.5)


def build() -> None:
    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()

    # ---- Title ----
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*PRIMARY)
    pdf.cell(0, 12, "Croar Payroll vs RazorpayX Payroll", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 7, "Feature comparison and gap analysis", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ---- Framing ----
    para(pdf,
         "RazorpayX Payroll is a fully-managed, India-statutory, bank-integrated payroll "
         "SaaS. Its core commercial value is automated statutory compliance filing and actual "
         "salary disbursement. Croar Payroll is a well-architected payroll engine and approval "
         "workflow: it owns the correctness-critical core (salary structures, calculation, "
         "lifecycle, statutory deductions, payslips, RBAC) but not yet the managed-service layer "
         "(real money movement, government filing, attendance, self-service).")

    # ---- Similar ----
    h1(pdf, "1.  What Croar already has (parity with RazorpayX)")
    feature_table(pdf, [
        ("Multi-company", "Org-scoped data", "company_id on every row; all queries scoped"),
        ("Employees", "Add / edit / exit", "Full CRUD, unique email/company, soft-delete keeps history"),
        ("Salary structure", "CTC -> component breakup", "Array earnings/deductions; fixed or percent-of lines"),
        ("Run payroll", "Monthly run + preview", "Cycle create + idempotent run; roll-up totals"),
        ("Approvals", "Review -> approve -> pay", "Guarded state machine DRAFT->PROCESSING->APPROVED->PAID"),
        ("Loss of Pay", "Attendance-driven LOP", "LOP days with 30-day pro-ration"),
        ("Payslips", "Auto-generated, downloadable", "Immutable snapshot; PDF; released only when PAID"),
        ("Email payslips", "Auto-email", "SMTP send_payslip_email"),
        ("Statutory PF/ESI/PT", "Auto-computed", "EPF+EPS, ESI, PT slabs; versioned snapshot"),
        ("Roles / access", "Admin, maker-checker", "RBAC ADMIN/HR/VIEWER -> payroll:* perms, API+UI"),
        ("Dashboard", "Org overview", "Coverage, cycle status, disbursed vs pending"),
    ])
    para(pdf,
         "Note: Croar's engineering core is clean - pure Decimal payslip math, a statutory "
         "ruleset version snapshotted onto each historical payslip, and soft-delete everywhere. "
         "That is the hard, correctness-critical part and it is solidly built.")

    # ---- Missing ----
    pdf.add_page()
    h1(pdf, "2.  What is missing vs RazorpayX Payroll")
    gaps = [
        ("Money movement (biggest gap)",
         "RazorpayX's headline feature is actually disbursing salaries via bank/UPI/IMPS/NEFT. "
         "Croar's PAID status is a workflow flag - there is no bank account, payout API, or "
         "transaction reconciliation. This is what makes RazorpayX 'payroll' vs a payslip generator."),
        ("TDS / Income Tax",
         "Explicitly deferred in statutory.py (Phase 2). RazorpayX does full TDS - annual "
         "projection, old vs new regime, 80C/declarations, Form 16, Form 24Q. Currently absent."),
        ("Automated compliance filing",
         "RazorpayX auto-files PF (ECR), ESI, PT and TDS challans with government portals. Croar "
         "computes the amounts but has no challan generation, return filing, or portal integration."),
        ("Attendance & Leave management",
         "Croar's LOP is a manual number on the structure. RazorpayX has leave types, balances, "
         "approvals and holiday calendars that feed LOP automatically. No attendance module here."),
        ("Employee self-service portal",
         "RazorpayX gives each employee a login to view payslips, submit tax declarations, "
         "download Form 16, apply for leave and reimbursements. Croar's VIEWER role is org-side; "
         "employees do not log in."),
        ("Reimbursements & flexible benefits",
         "Claims, Flexible Benefit Plan (FBP) and expense reimbursements feeding payroll are not present."),
        ("Onboarding & contractor payments",
         "RazorpayX handles onboarding flows and contractor/vendor payouts (TDS 194C/194J). Croar "
         "has employees only - no contractor payment path."),
        ("Integrations / ecosystem",
         "Accounting sync (Zoho/Tally/QuickBooks), Slack/HRMS, insurance marketplace - none present "
         "(Celery/Redis is scaffolded but unused)."),
        ("Reports & registers",
         "Statutory registers, salary register exports, GL/journal entries for accounting - Croar has "
         "a dashboard but no exportable statutory/accounting reports."),
        ("Operational polish",
         "No audit log/activity trail (who approved/paid, when); no per-run variable pay/bonus/arrears "
         "overrides (lines live on the structure, not the run); only a 30-day monthly basis although a "
         "PayFrequency enum exists."),
    ]
    for i, (t, b) in enumerate(gaps, 1):
        gap_block(pdf, i, t, b)

    # ---- Summary / roadmap ----
    if pdf.get_y() > pdf.h - 70:
        pdf.add_page()
    h1(pdf, "3.  Summary & suggested next steps")
    para(pdf,
         "Croar has the payroll engine and workflow layer - the hard, correctness-critical core. "
         "What is missing is the managed-service layer that defines RazorpayX commercially: real "
         "bank disbursement, TDS/income-tax, automated government filing, attendance/leave, employee "
         "self-service, reimbursements and contractor payouts.")
    para(pdf, "Highest-impact next steps, in order:")
    for n, (t, b) in enumerate([
        ("Per-run adjustments / bonuses / arrears", "Override lines per cycle, not just on the structure."),
        ("TDS computation", "Annual projection, regime choice, Form 16/24Q."),
        ("Attendance -> LOP automation", "Feed LOP from a leave/attendance module instead of manual entry."),
        ("Employee self-service portal", "Per-employee login for payslips, declarations, leave."),
        ("Payout integration", "Real bank/UPI disbursement - the largest effort."),
    ], 1):
        bullet(pdf, f"{n}. {t}", b, color=PRIMARY)
    para(pdf,
         "The first three build directly on the existing clean engine; the last is a much larger "
         "integration effort.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT))
    print(f"Wrote {OUTPUT.resolve()}")


if __name__ == "__main__":
    build()
