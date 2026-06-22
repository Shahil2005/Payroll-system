"""Leave management + segregation-of-duties (maker-checker) tests.

Covers the leave ledger (types, balances, accrual) and the leave-request
lifecycle, including how an APPROVED request stamps the timesheet grid so the
payroll run sees PAID_LEAVE (no LOP) vs UNPAID_LEAVE (LOP). Also covers the
maker-checker guard on both timesheet and leave approval. Infra mirrors
test_timesheets (scratch DB, wipe guard, per-test TestClient).
"""
from datetime import date
from decimal import Decimal
from typing import Any, Generator

import psycopg2
import pytest
from fastapi import status

from app.constants import AccrualMethod
from app.core.security import hash_password
from app.models.leave import LeaveType
from app.services.leave_service import _accrued_for
from tests.test_payroll import (
    ADMIN,
    COMPANY_ID,
    EMP1,
    _DSN,
    _create_cycle,
    _create_structure,
    _require_wipe_allowed,
    _reset_db,
    authed_client,
)

LEAVE_BASE = "/api/v1/enterprise/leave"
TS_BASE = "/api/v1/enterprise/timesheets"
CAL_BASE = "/api/v1/enterprise/calendar"

# A second approver, so maker-checker (submitter != approver) is testable.
HR2 = ("hr2@croar.com", "hr2pass")


@pytest.fixture(autouse=True)
def db_setup() -> Generator[None, None, None]:
    _require_wipe_allowed()
    _reset_db()
    _seed_hr2()
    _truncate_leave()
    yield
    _truncate_leave()


def _seed_hr2() -> None:
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (company_id, email, full_name, hashed_password, role, "
        "is_active, created_at, updated_at) VALUES (%s, %s, %s, %s, 'HR', true, now(), now()) "
        "ON CONFLICT (company_id, email) DO NOTHING;",
        (COMPANY_ID, HR2[0], "HR Two", hash_password(HR2[1])),
    )
    cur.close()
    conn.close()


def _truncate_leave() -> None:
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    for table in (
        "leave_requests", "leave_balances", "leave_types",
        "timesheet_entries", "timesheets", "holidays",
    ):
        cur.execute(f"TRUNCATE TABLE {table} CASCADE;")
    cur.execute("UPDATE companies SET statutory_settings = NULL WHERE id = %s;", (COMPANY_ID,))
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _create_type(c: Any, **overrides: Any) -> dict[str, Any]:
    payload = {
        "name": "Casual Leave", "code": "CL", "is_paid": True,
        "annual_quota": 12, "accrual": "ANNUAL",
    }
    payload.update(overrides)
    resp = c.post(f"{LEAVE_BASE}/types", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


def _generate(c: Any, cycle_id: str) -> None:
    assert c.post(f"{TS_BASE}/cycles/{cycle_id}/generate").status_code == 200


def _emp_timesheet(c: Any, cycle_id: str, employee_id: str = EMP1) -> dict[str, Any]:
    rows = c.get(f"{TS_BASE}/cycles/{cycle_id}").json()
    return next(r for r in rows if r["employee_id"] == employee_id)


def _request(c: Any, type_id: str, start: str, end: str, **extra: Any) -> dict[str, Any]:
    body = {"employee_id": EMP1, "leave_type_id": type_id, "start_date": start, "end_date": end}
    body.update(extra)
    resp = c.post(f"{LEAVE_BASE}/requests", json=body)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


def _enable_maker_checker(c: Any) -> None:
    assert c.put(
        f"{CAL_BASE}/config", json={"enforce_maker_checker": True}
    ).status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Unit — accrual
# ---------------------------------------------------------------------------
def test_accrual_annual_vs_monthly() -> None:
    annual = LeaveType(annual_quota=Decimal("12"), accrual=AccrualMethod.ANNUAL.value)
    monthly = LeaveType(annual_quota=Decimal("12"), accrual=AccrualMethod.MONTHLY.value)
    # ANNUAL: full quota regardless of date.
    assert _accrued_for(annual, as_of=date(2026, 6, 18)) == Decimal("12")
    # MONTHLY: FY starts April -> June is month 3 -> 1/month * 3 = 3.
    assert _accrued_for(monthly, as_of=date(2026, 6, 18)) == Decimal("3.00")
    # March is month 12 -> full quota.
    assert _accrued_for(monthly, as_of=date(2027, 3, 1)) == Decimal("12")


# ---------------------------------------------------------------------------
# Balances
# ---------------------------------------------------------------------------
def test_balances_seeded_for_paid_types() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        balances = c.get(f"{LEAVE_BASE}/balances").json()
        cl = next(b for b in balances if b["leave_type_id"] == lt["id"] and b["employee_id"] == EMP1)
        assert Decimal(str(cl["entitled"])) == Decimal("12")
        assert Decimal(str(cl["balance"])) == Decimal("12")
        assert Decimal(str(cl["used"])) == Decimal("0")


# ---------------------------------------------------------------------------
# Leave requests -> timesheet stamping -> run
# ---------------------------------------------------------------------------
def test_paid_leave_decrements_balance_and_marks_timesheet() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)  # 2026-06-01 .. 2026-06-30
        _generate(c, cycle["id"])

        # 2026-06-02 (Tue) + 06-03 (Wed) are working days.
        req = _request(c, lt["id"], "2026-06-02", "2026-06-03")
        assert Decimal(str(req["days"])) == Decimal("2")
        assert c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200

        # Balance used 2; timesheet days stamped PAID_LEAVE (paid -> no LOP).
        balances = c.get(f"{LEAVE_BASE}/balances").json()
        cl = next(b for b in balances if b["leave_type_id"] == lt["id"] and b["employee_id"] == EMP1)
        assert Decimal(str(cl["used"])) == Decimal("2")

        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "PAID_LEAVE"
        assert marked["2026-06-03"] == "PAID_LEAVE"
        assert Decimal(str(detail["lop_days"])) == Decimal("0")  # paid -> no LOP


def test_unpaid_leave_marks_lop_and_feeds_run() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c, name="Loss of Pay", code="LOP", is_paid=False, annual_quota=0)
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])

        req = _request(c, lt["id"], "2026-06-02", "2026-06-03")
        assert c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200

        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        assert Decimal(str(detail["lop_days"])) == Decimal("2")
        c.post(f"{TS_BASE}/{ts['id']}/submit")
        c.post(f"{TS_BASE}/{ts['id']}/approve")

        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        payslips = c.get(f"/api/v1/enterprise/payroll/cycles/{cycle['id']}/payslips").json()
        ps = next(p for p in payslips if p["employee_id"] == EMP1)
        assert Decimal(str(ps["lop_days"])) == Decimal("2")


def test_generate_overlays_preexisting_approved_leave() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        # Approve leave BEFORE generating the timesheet — generate must overlay it.
        req = _request(c, lt["id"], "2026-06-02", "2026-06-02")
        c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={})
        _generate(c, cycle["id"])
        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "PAID_LEAVE"


def test_insufficient_paid_balance_rejected() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c, annual_quota=1)  # only 1 day
        _create_structure(c, employee_id=EMP1)
        _create_cycle(c)
        req = _request(c, lt["id"], "2026-06-02", "2026-06-03")  # 2 days
        resp = c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={})
        assert resp.status_code == status.HTTP_409_CONFLICT, resp.text


def test_half_day_counts_half() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        _create_cycle(c)
        req = _request(c, lt["id"], "2026-06-02", "2026-06-02", half_day=True)
        assert Decimal(str(req["days"])) == Decimal("0.5")


def test_seed_default_leave_types_is_idempotent() -> None:
    with authed_client(ADMIN) as c:
        # First seed creates the standard set.
        resp = c.post(f"{LEAVE_BASE}/types/seed-defaults")
        assert resp.status_code == status.HTTP_200_OK, resp.text
        created = resp.json()
        codes = {t["code"] for t in created}
        assert {"CL", "SL", "EL", "ML", "PL", "BL", "LOP"} <= codes

        # Earned Leave accrues monthly with a carry-forward cap; LOP is unpaid.
        el = next(t for t in created if t["code"] == "EL")
        assert el["accrual"] == "MONTHLY"
        assert Decimal(str(el["carry_forward_cap"])) == Decimal("30")
        lop = next(t for t in created if t["code"] == "LOP")
        assert lop["is_paid"] is False

        # Seeding again creates nothing new (idempotent by code).
        again = c.post(f"{LEAVE_BASE}/types/seed-defaults").json()
        assert again == []
        all_types = c.get(f"{LEAVE_BASE}/types").json()
        assert len([t for t in all_types if t["code"] in codes]) == len(codes)


def test_paid_half_day_adds_no_lop() -> None:
    """A paid half-day leave covers the off-half -> HALF_DAY_PAID, zero LOP."""
    with authed_client(ADMIN) as c:
        lt = _create_type(c)  # is_paid=True
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        req = _request(c, lt["id"], "2026-06-02", "2026-06-02", half_day=True)
        assert c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200

        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "HALF_DAY_PAID"
        assert Decimal(str(detail["lop_days"])) == Decimal("0")  # paid -> no LOP


def test_unpaid_half_day_adds_half_lop() -> None:
    """An unpaid half-day leave -> HALF_DAY, 0.5 LOP."""
    with authed_client(ADMIN) as c:
        lt = _create_type(c, name="Loss of Pay", code="LOP", is_paid=False, annual_quota=0)
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])
        req = _request(c, lt["id"], "2026-06-02", "2026-06-02", half_day=True)
        assert c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200

        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "HALF_DAY"
        assert Decimal(str(detail["lop_days"])) == Decimal("0.5")


def test_cancel_approved_leave_restores_balance_and_reverts_timesheet() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        _create_structure(c, employee_id=EMP1)
        cycle = _create_cycle(c)
        _generate(c, cycle["id"])

        req = _request(c, lt["id"], "2026-06-02", "2026-06-03")  # 2 working days
        assert c.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200

        # Cancel the now-approved request.
        resp = c.post(f"{LEAVE_BASE}/requests/{req['id']}/cancel", json={})
        assert resp.status_code == status.HTTP_200_OK, resp.text
        assert resp.json()["status"] == "CANCELLED"

        # Balance credited back to the full quota.
        balances = c.get(f"{LEAVE_BASE}/balances").json()
        cl = next(b for b in balances if b["leave_type_id"] == lt["id"] and b["employee_id"] == EMP1)
        assert Decimal(str(cl["used"])) == Decimal("0")
        assert Decimal(str(cl["balance"])) == Decimal("12")

        # Timesheet days reverted from PAID_LEAVE to PRESENT.
        ts = _emp_timesheet(c, cycle["id"])
        detail = c.get(f"{TS_BASE}/{ts['id']}").json()
        marked = {e["entry_date"]: e["day_status"] for e in detail["entries"]}
        assert marked["2026-06-02"] == "PRESENT"
        assert marked["2026-06-03"] == "PRESENT"
        assert Decimal(str(detail["lop_days"])) == Decimal("0")


def test_overlapping_leave_request_rejected() -> None:
    with authed_client(ADMIN) as c:
        lt = _create_type(c)
        _create_cycle(c)
        _request(c, lt["id"], "2026-06-02", "2026-06-03")
        # A second request sharing 06-03 must be refused.
        body = {
            "employee_id": EMP1, "leave_type_id": lt["id"],
            "start_date": "2026-06-03", "end_date": "2026-06-04",
        }
        resp = c.post(f"{LEAVE_BASE}/requests", json=body)
        assert resp.status_code == status.HTTP_409_CONFLICT, resp.text


# ---------------------------------------------------------------------------
# Segregation of duties (maker-checker)
# ---------------------------------------------------------------------------
def test_timesheet_self_approval_blocked_when_enforced() -> None:
    with authed_client(ADMIN) as admin:
        _enable_maker_checker(admin)
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        _generate(admin, cycle["id"])
        ts = _emp_timesheet(admin, cycle["id"])
        assert admin.post(f"{TS_BASE}/{ts['id']}/submit").status_code == 200
        # Same user (ADMIN) cannot approve what they submitted.
        assert admin.post(f"{TS_BASE}/{ts['id']}/approve").status_code == status.HTTP_409_CONFLICT

    # A different approver can.
    with authed_client(HR2) as hr2:
        assert hr2.post(f"{TS_BASE}/{ts['id']}/approve").status_code == 200


def test_leave_self_approval_blocked_when_enforced() -> None:
    with authed_client(ADMIN) as admin:
        _enable_maker_checker(admin)
        lt = _create_type(admin)
        _create_cycle(admin)
        req = _request(admin, lt["id"], "2026-06-02", "2026-06-03")  # filed by ADMIN
        resp = admin.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={})
        assert resp.status_code == status.HTTP_409_CONFLICT, resp.text

    with authed_client(HR2) as hr2:
        assert hr2.post(f"{LEAVE_BASE}/requests/{req['id']}/approve", json={}).status_code == 200


def test_maker_checker_off_allows_self_approval() -> None:
    with authed_client(ADMIN) as admin:
        # Default: enforce_maker_checker is off.
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        _generate(admin, cycle["id"])
        ts = _emp_timesheet(admin, cycle["id"])
        admin.post(f"{TS_BASE}/{ts['id']}/submit")
        assert admin.post(f"{TS_BASE}/{ts['id']}/approve").status_code == 200
