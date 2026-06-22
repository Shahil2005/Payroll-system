"""Timesheets + work-calendar tests.

Unit tests cover the pure pieces (calendar working-day logic, attendance
aggregation, hourly payslip). Integration tests drive the full API flow
(generate -> edit -> submit -> approve -> run) and assert the run sources LOP /
hours from the approved timesheet. Infra mirrors test_payroll (scratch DB,
PAYROLL_ALLOW_DB_WIPE guard, per-test TestClient).
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Generator

import psycopg2
import pytest
from fastapi import status

from app.models.timesheets import Timesheet, TimesheetEntry
from app.services.calendar_service import is_working_day
from app.services.payroll_service import compute_hourly_payslip
from app.services.timesheet_service import recompute_aggregates
from tests.test_payroll import (  # reuse the established harness
    ADMIN,
    COMPANY_ID,
    EMP1,
    EMP2,
    _DSN,
    _create_cycle,
    _create_structure,
    _require_wipe_allowed,
    _reset_db,
    authed_client,
)

TS_BASE = "/api/v1/enterprise/timesheets"
CAL_BASE = "/api/v1/enterprise/calendar"


@pytest.fixture(autouse=True)
def db_setup() -> Generator[None, None, None]:
    _require_wipe_allowed()
    _reset_db()
    _truncate_timesheets()
    yield
    _truncate_timesheets()


def _truncate_timesheets() -> None:
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE timesheet_entries CASCADE;")
    cur.execute("TRUNCATE TABLE timesheets CASCADE;")
    cur.execute("TRUNCATE TABLE holidays CASCADE;")
    # Reset any work-calendar overrides left in the company settings.
    cur.execute("UPDATE companies SET statutory_settings = NULL WHERE id = %s;", (COMPANY_ID,))
    cur.close()
    conn.close()


def _expected_working_days(start: date, end: date, offs: set[str], holidays: set[date]) -> int:
    count, day = 0, start
    while day <= end:
        if is_working_day(day, offs, holidays):
            count += 1
        day += timedelta(days=1)
    return count


# ---------------------------------------------------------------------------
# Unit tests — pure logic
# ---------------------------------------------------------------------------
def test_is_working_day_excludes_weekend_and_holiday() -> None:
    offs = {"SAT", "SUN"}
    holiday = date(2026, 6, 15)
    # First Saturday in June 2026 (found, not hard-coded).
    sat = date(2026, 6, 1)
    while sat.weekday() != 5:
        sat += timedelta(days=1)
    assert is_working_day(sat, offs, {holiday}) is False
    assert is_working_day(holiday, offs, {holiday}) is False
    # A weekday that isn't the holiday is a working day.
    assert is_working_day(date(2026, 6, 1), offs, {holiday}) is True


def test_recompute_aggregates() -> None:
    ts = Timesheet(period_start=date(2026, 6, 1), period_end=date(2026, 6, 5))
    ts.entries = [
        TimesheetEntry(entry_date=date(2026, 6, 1), day_status="PRESENT"),
        TimesheetEntry(entry_date=date(2026, 6, 2), day_status="UNPAID_LEAVE"),
        TimesheetEntry(entry_date=date(2026, 6, 3), day_status="HALF_DAY"),
        TimesheetEntry(entry_date=date(2026, 6, 4), day_status="WEEKLY_OFF"),
        TimesheetEntry(entry_date=date(2026, 6, 5), day_status="HOLIDAY"),
    ]
    recompute_aggregates(ts)
    # Scheduled working days = PRESENT + UNPAID + HALF = 3.
    assert ts.lop_days == Decimal("1.5")  # 1 unpaid + 0.5 half
    assert ts.half_days == Decimal("1")
    assert ts.worked_days == Decimal("1.5")  # 3 scheduled - 1.5 lop


def test_recompute_aggregates_hours() -> None:
    ts = Timesheet(period_start=date(2026, 6, 1), period_end=date(2026, 6, 2))
    ts.entries = [
        TimesheetEntry(entry_date=date(2026, 6, 1), day_status="PRESENT", hours=Decimal("8")),
        TimesheetEntry(entry_date=date(2026, 6, 2), day_status="PRESENT", hours=Decimal("7.5")),
    ]
    recompute_aggregates(ts)
    assert ts.total_hours == Decimal("15.5")


def test_compute_hourly_payslip() -> None:
    from app.models.payroll import SalaryStructure

    struct = SalaryStructure(
        company_id=COMPANY_ID,
        ctc=Decimal("0"),
        currency="INR",
        pay_frequency="HOURLY",
        hourly_rate=Decimal("500"),
        components=[],
        default_deductions=[],
    )
    res = compute_hourly_payslip(struct, Decimal("160"))
    assert res["gross_earnings"] == Decimal("80000.00")  # 160 * 500
    assert res["total_deductions"] == Decimal("0.00")
    assert res["net_pay"] == Decimal("80000.00")


# ---------------------------------------------------------------------------
# Integration — attendance flow feeds the run
# ---------------------------------------------------------------------------
def _generate(client: Any, cycle_id: str) -> dict[str, Any]:
    resp = client.post(f"{TS_BASE}/cycles/{cycle_id}/generate")
    assert resp.status_code == status.HTTP_200_OK, resp.text
    return resp.json()


def _emp_timesheet(client: Any, cycle_id: str, employee_id: str) -> dict[str, Any]:
    rows = client.get(f"{TS_BASE}/cycles/{cycle_id}").json()
    return next(r for r in rows if r["employee_id"] == employee_id)


def _attendance(client: Any, cycle_id: str, payslip_id: str) -> dict[str, Any]:
    """Drive the cycle to PAID (the payslip detail/snapshot is gated to PAID) and
    return the payslip's attendance snapshot."""
    client.post(f"/api/v1/enterprise/payroll/cycles/{cycle_id}/approve")
    client.post(f"/api/v1/enterprise/payroll/cycles/{cycle_id}/mark-paid")
    detail = client.get(f"/api/v1/enterprise/payroll/payslips/{payslip_id}").json()
    return detail["statutory"]["attendance"]


def test_generate_is_idempotent_and_skips_unstructured() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1)  # EMP2 has no structure
        cycle = _create_cycle(c)
        first = _generate(c, cycle["id"])
        assert first["created"] == 1  # only EMP1
        assert any(s["employee_id"] == EMP2 for s in first["skipped"])
        second = _generate(c, cycle["id"])
        assert second["created"] == 0 and second["existing"] == 1


def test_approved_timesheet_lop_overrides_structure() -> None:
    with authed_client(ADMIN) as c:
        # Structure carries lop_days=5; the approved timesheet should win.
        _create_structure(c, employee_id=EMP1, lop_days=5)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        ts = _emp_timesheet(c, cycle["id"], EMP1)

        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        # Mark the first working day as unpaid leave (1 LOP day).
        working = next(e for e in detail["entries"] if e["day_status"] == "PRESENT")
        upd = c.put(
            f"{TS_BASE}/{ts['id']}/entries",
            json={"entries": [{"entry_date": working["entry_date"], "day_status": "UNPAID_LEAVE"}]},
        )
        assert upd.status_code == status.HTTP_200_OK, upd.text
        assert Decimal(str(upd.json()["lop_days"])) == Decimal("1")

        assert c.post(f"{TS_BASE}/{ts['id']}/submit").status_code == 200
        assert c.post(f"{TS_BASE}/{ts['id']}/approve").status_code == 200

        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        payslips = c.get(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/payslips").json()
        ps = next(p for p in payslips if p["employee_id"] == EMP1)
        # Timesheet LOP (1) wins over the structure's lop_days (5).
        assert Decimal(str(ps["lop_days"])) == Decimal("1")
        assert _attendance(c, cycle["id"], ps["id"])["source"] == "timesheet"


def test_no_approved_timesheet_falls_back_to_structure_lop() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1, lop_days=2)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])  # generated but NOT approved (stays DRAFT)
        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        payslips = c.get(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/payslips").json()
        ps = next(p for p in payslips if p["employee_id"] == EMP1)
        assert Decimal(str(ps["lop_days"])) == Decimal("2")  # structure fallback
        assert _attendance(c, cycle["id"], ps["id"])["source"] == "structure"


def test_calendar_working_days_drive_snapshot() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1)
        # Add a holiday inside the period; default weekly-offs are SAT/SUN.
        assert c.post(
            f"{CAL_BASE}/holidays", json={"holiday_date": "2026-06-15", "name": "Test Holiday"}
        ).status_code == status.HTTP_201_CREATED
        cycle = _create_cycle(c)  # 2026-06-01 .. 2026-06-30
        _generate(c, cycle["id"])
        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        payslips = c.get(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/payslips").json()
        ps = next(p for p in payslips if p["employee_id"] == EMP1)
        expected = _expected_working_days(
            date(2026, 6, 1), date(2026, 6, 30), {"SAT", "SUN"}, {date(2026, 6, 15)}
        )
        assert _attendance(c, cycle["id"], ps["id"])["working_days"] == float(expected)


def test_hourly_employee_paid_from_timesheet_hours() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(
            c,
            employee_id=EMP1,
            ctc=0,
            pay_frequency="HOURLY",
            hourly_rate=500,
            components=[],
            default_deductions=[],
        )
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        ts = _emp_timesheet(c, cycle["id"], EMP1)
        assert ts["mode"] == "HOURLY"
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        # Log 8 hours on each of the first two working days.
        working = [e for e in detail["entries"] if e["day_status"] == "PRESENT"][:2]
        c.put(
            f"{TS_BASE}/{ts['id']}/entries",
            json={"entries": [{"entry_date": w["entry_date"], "hours": 8} for w in working]},
        )
        c.post(f"{TS_BASE}/{ts['id']}/submit")
        c.post(f"{TS_BASE}/{ts['id']}/approve")
        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        payslips = c.get(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/payslips").json()
        ps = next(p for p in payslips if p["employee_id"] == EMP1)
        assert Decimal(str(ps["gross_earnings"])) == Decimal("8000.00")  # 16h * 500
        assert ps["paid_days"] is None


def test_edit_blocked_after_approval() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        ts = _emp_timesheet(c, cycle["id"], EMP1)
        c.post(f"{TS_BASE}/{ts['id']}/submit")
        c.post(f"{TS_BASE}/{ts['id']}/approve")
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        any_day = detail["entries"][0]["entry_date"]
        resp = c.put(
            f"{TS_BASE}/{ts['id']}/entries",
            json={"entries": [{"entry_date": any_day, "day_status": "UNPAID_LEAVE"}]},
        )
        assert resp.status_code == status.HTTP_409_CONFLICT


# ---------------------------------------------------------------------------
# CSV / biometric attendance import
# ---------------------------------------------------------------------------
def _import_csv(c: Any, cycle_id: str, csv_text: str) -> dict[str, Any]:
    resp = c.post(
        f"{TS_BASE}/cycles/{cycle_id}/import",
        files={"file": ("attendance.csv", csv_text.encode(), "text/csv")},
    )
    assert resp.status_code == status.HTTP_200_OK, resp.text
    return resp.json()


def test_import_attendance_status_and_hours() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)  # 2026-06-01 .. 06-30
        _generate(c, cycle["id"])
        # 06-02 Tue, 06-03 Wed — both working days.
        csv_text = (
            "employee_id,date,status,hours\n"
            f"{EMP1},2026-06-02,WFH,8\n"
            f"{EMP1},2026-06-03,ABSENT,\n"
        )
        result = _import_csv(c, cycle["id"], csv_text)
        assert result["updated"] == 2
        assert result["skipped"] == []

        ts = _emp_timesheet(c, cycle["id"], EMP1)
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "WFH"
        assert marked["2026-06-03"] == "UNPAID_LEAVE"  # ABSENT -> LOP
        assert Decimal(str(detail["lop_days"])) == Decimal("1")


def test_import_attendance_punch_times_and_skips() -> None:
    with authed_client(ADMIN) as c:
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        csv_text = (
            "employee_id,date,check_in,check_out\n"
            f"{EMP1},2026-06-02,09:00,17:30\n"  # 8.5h, present
            "99999999-9999-9999-9999-999999999999,2026-06-02,09:00,17:30\n"  # unknown emp
            f"{EMP1},2026-06-06,09:00,17:30\n"  # Saturday -> weekly-off, skipped
        )
        result = _import_csv(c, cycle["id"], csv_text)
        assert result["updated"] == 1
        assert len(result["skipped"]) == 2  # unknown employee + non-working day

        ts = _emp_timesheet(c, cycle["id"], EMP1)
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        entry = next(e for e in detail["entries"] if e["entry_date"] == "2026-06-02")
        assert entry["day_status"] == "PRESENT"  # a punch implies present
        assert Decimal(str(entry["hours"])) == Decimal("8.50")
