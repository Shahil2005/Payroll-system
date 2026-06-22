"""Employee self-service (EMPLOYEE role + /api/v1/me) tests.

Covers the ownership-scoped access model: an EMPLOYEE-role user linked to one
Employee can read only that employee's timesheets, cannot reach the company-wide
/enterprise endpoints, and is useless without a link. Also covers the admin-side
link validation on user creation. Infra mirrors test_timesheets (scratch DB,
wipe guard, per-test TestClient).
"""
from decimal import Decimal
from typing import Any, Generator

import psycopg2
import pytest
from fastapi import status

from app.core.security import hash_password
from tests.test_payroll import (
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

ME_BASE = "/api/v1/me"
TS_BASE = "/api/v1/enterprise/timesheets"
PAY_BASE = "/api/v1/enterprise/payroll"
LEAVE_BASE = "/api/v1/enterprise/leave"
EMP_USER = ("john.emp@croar.com", "emppass1")


@pytest.fixture(autouse=True)
def db_setup() -> Generator[None, None, None]:
    _require_wipe_allowed()
    _reset_db()
    _truncate()
    yield
    _truncate()


def _truncate() -> None:
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    for table in (
        "timesheet_entries", "timesheets", "holidays",
        "leave_requests", "leave_balances", "leave_types",
    ):
        cur.execute(f"TRUNCATE TABLE {table} CASCADE;")
    cur.execute("UPDATE companies SET statutory_settings = NULL WHERE id = %s;", (COMPANY_ID,))
    cur.close()
    conn.close()


def _create_user(c: Any, **overrides: Any) -> Any:
    body = {
        "email": EMP_USER[0], "password": EMP_USER[1],
        "full_name": "John Doe", "role": "EMPLOYEE", "employee_id": EMP1,
    }
    body.update(overrides)
    return c.post("/api/v1/auth/users", json=body)


def _generated_timesheets(c: Any, cycle_id: str) -> dict[str, str]:
    """employee_id -> timesheet_id for the cycle (admin view)."""
    rows = c.get(f"{TS_BASE}/cycles/{cycle_id}").json()
    return {r["employee_id"]: r["id"] for r in rows}


def _seed_unlinked_employee_user(email: str, pw: str) -> None:
    """An EMPLOYEE-role user with no employee link (can't be made via the API,
    which requires the link — so insert directly to test the 409 guard)."""
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (company_id, email, full_name, hashed_password, role, "
        "is_active, created_at, updated_at) VALUES (%s, %s, %s, %s, 'EMPLOYEE', "
        "true, now(), now()) ON CONFLICT (company_id, email) DO NOTHING;",
        (COMPANY_ID, email, "Unlinked", hash_password(pw)),
    )
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Ownership scoping
# ---------------------------------------------------------------------------
def test_employee_sees_only_their_own_timesheet() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        _create_structure(admin, employee_id=EMP2)
        cycle = _create_cycle(admin)
        assert admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate").status_code == 200
        ts_by_emp = _generated_timesheets(admin, cycle["id"])
        assert EMP1 in ts_by_emp and EMP2 in ts_by_emp
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        mine = emp.get(f"{ME_BASE}/timesheets")
        assert mine.status_code == status.HTTP_200_OK, mine.text
        rows = mine.json()
        # Exactly one timesheet — EMP1's — and never EMP2's.
        assert [r["employee_id"] for r in rows] == [EMP1]

        # Own detail is visible…
        own = emp.get(f"{ME_BASE}/timesheets/{ts_by_emp[EMP1]}")
        assert own.status_code == status.HTTP_200_OK
        # …a colleague's is 404 (not 403 — don't confirm the id exists).
        other = emp.get(f"{ME_BASE}/timesheets/{ts_by_emp[EMP2]}")
        assert other.status_code == status.HTTP_404_NOT_FOUND


def test_employee_cannot_reach_enterprise_endpoints() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate")
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        # EMPLOYEE holds only self:read — the company-wide list is forbidden.
        resp = emp.get(f"{TS_BASE}/cycles/{cycle['id']}")
        assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_self_read_without_link_is_rejected() -> None:
    _seed_unlinked_employee_user("nolink@croar.com", "nolinkpw")
    with authed_client(("nolink@croar.com", "nolinkpw")) as emp:
        resp = emp.get(f"{ME_BASE}/timesheets")
        assert resp.status_code == status.HTTP_409_CONFLICT, resp.text


# ---------------------------------------------------------------------------
# Admin-side link validation on user creation
# ---------------------------------------------------------------------------
def test_employee_role_requires_link() -> None:
    with authed_client(ADMIN) as admin:
        resp = _create_user(admin, employee_id=None)
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_link_only_allowed_for_employee_role() -> None:
    with authed_client(ADMIN) as admin:
        resp = _create_user(admin, role="VIEWER")  # link + non-employee role
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_link_to_unknown_employee_404() -> None:
    with authed_client(ADMIN) as admin:
        resp = _create_user(admin, employee_id="33333333-3333-3333-3333-333333333333")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_one_login_per_employee() -> None:
    with authed_client(ADMIN) as admin:
        assert _create_user(admin).status_code == status.HTTP_201_CREATED
        # A second login linked to the same employee is refused.
        dup = _create_user(admin, email="john2.emp@croar.com")
        assert dup.status_code == status.HTTP_409_CONFLICT


# ---------------------------------------------------------------------------
# Payslips — only the employee's own, and only once the cycle is PAID
# ---------------------------------------------------------------------------
def _run_to_paid(admin: Any, cycle_id: str) -> None:
    assert admin.post(f"{PAY_BASE}/cycles/{cycle_id}/run").status_code == 200
    assert admin.post(f"{PAY_BASE}/cycles/{cycle_id}/approve").status_code == 200
    assert admin.post(f"{PAY_BASE}/cycles/{cycle_id}/mark-paid").status_code == 200


def test_employee_sees_only_own_paid_payslip() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        _create_structure(admin, employee_id=EMP2)
        cycle = _create_cycle(admin)
        _run_to_paid(admin, cycle["id"])
        payslips = admin.get(f"{PAY_BASE}/cycles/{cycle['id']}/payslips").json()
        ps_by_emp = {p["employee_id"]: p["id"] for p in payslips}
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        mine = emp.get(f"{ME_BASE}/payslips")
        assert mine.status_code == status.HTTP_200_OK, mine.text
        rows = mine.json()
        assert [r["employee_id"] for r in rows] == [EMP1]
        assert rows[0]["cycle_name"]  # cycle context is included

        assert emp.get(f"{ME_BASE}/payslips/{ps_by_emp[EMP1]}").status_code == 200
        assert emp.get(f"{ME_BASE}/payslips/{ps_by_emp[EMP2]}").status_code == 404


def test_payslip_hidden_until_cycle_paid() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        # Run + approve but DO NOT mark paid.
        assert admin.post(f"{PAY_BASE}/cycles/{cycle['id']}/run").status_code == 200
        assert admin.post(f"{PAY_BASE}/cycles/{cycle['id']}/approve").status_code == 200
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        rows = emp.get(f"{ME_BASE}/payslips").json()
        assert rows == []  # not released until PAID


# ---------------------------------------------------------------------------
# Leave self-service — file / view / cancel one's own
# ---------------------------------------------------------------------------
def _create_leave_type(c: Any) -> dict[str, Any]:
    resp = c.post(
        f"{LEAVE_BASE}/types",
        json={"name": "Casual Leave", "code": "CL", "is_paid": True,
              "annual_quota": 12, "accrual": "ANNUAL"},
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


def test_employee_files_views_and_cancels_own_leave() -> None:
    with authed_client(ADMIN) as admin:
        lt = _create_leave_type(admin)
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        # Active types are offered to the apply form.
        types = emp.get(f"{ME_BASE}/leave/types").json()
        assert any(t["id"] == lt["id"] for t in types)

        # File a request for oneself — no employee_id in the payload.
        resp = emp.post(
            f"{ME_BASE}/leave/requests",
            json={"leave_type_id": lt["id"], "start_date": "2026-06-02",
                  "end_date": "2026-06-03", "half_day": False},
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.text
        req = resp.json()
        assert req["employee_id"] == EMP1  # forced from the link

        # It shows up in my history and my balance reflects the (pending) request.
        mine = emp.get(f"{ME_BASE}/leave/requests").json()
        assert [r["id"] for r in mine] == [req["id"]]
        balances = emp.get(f"{ME_BASE}/leave/balances").json()
        assert any(b["leave_type_id"] == lt["id"] for b in balances)

        # Cancel my own request.
        cancelled = emp.post(f"{ME_BASE}/leave/requests/{req['id']}/cancel", json={})
        assert cancelled.status_code == status.HTTP_200_OK, cancelled.text
        assert cancelled.json()["status"] == "CANCELLED"


# ---------------------------------------------------------------------------
# Self-mark attendance on one's own draft timesheet
# ---------------------------------------------------------------------------
def _my_timesheet(emp: Any) -> dict[str, Any]:
    rows = emp.get(f"{ME_BASE}/timesheets").json()
    assert rows, "employee has no timesheet"
    return rows[0]


def test_employee_self_marks_attendance() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)  # 2026-06-01 .. 06-30
        assert admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate").status_code == 200
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        ts = _my_timesheet(emp)
        # 2026-06-02 (Tue) is a past working day — mark it WFH.
        resp = emp.put(
            f"{ME_BASE}/timesheets/{ts['id']}/mark",
            json={"entries": [{"entry_date": "2026-06-02", "day_status": "WFH"}]},
        )
        assert resp.status_code == status.HTTP_200_OK, resp.text
        marked = {e["entry_date"]: e["day_status"] for e in resp.json()["entries"]}
        assert marked["2026-06-02"] == "WFH"
        assert Decimal(str(resp.json()["lop_days"])) == Decimal("0")  # WFH is paid


def test_self_mark_cannot_self_lop() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate")
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        ts = _my_timesheet(emp)
        # An employee may not dock their own pay via UNPAID_LEAVE.
        resp = emp.put(
            f"{ME_BASE}/timesheets/{ts['id']}/mark",
            json={"entries": [{"entry_date": "2026-06-02", "day_status": "UNPAID_LEAVE"}]},
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, resp.text


def test_self_mark_rejects_future_date() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate")
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        ts = _my_timesheet(emp)
        # 2026-06-30 is after "today" (2026-06-22) — not markable yet.
        resp = emp.put(
            f"{ME_BASE}/timesheets/{ts['id']}/mark",
            json={"entries": [{"entry_date": "2026-06-30", "day_status": "WFH"}]},
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, resp.text


def test_self_mark_blocked_once_approved() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        cycle = _create_cycle(admin)
        admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate")
        ts = next(
            r for r in admin.get(f"{TS_BASE}/cycles/{cycle['id']}").json()
            if r["employee_id"] == EMP1
        )
        admin.post(f"{TS_BASE}/{ts['id']}/submit")
        admin.post(f"{TS_BASE}/{ts['id']}/approve")
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        resp = emp.put(
            f"{ME_BASE}/timesheets/{ts['id']}/mark",
            json={"entries": [{"entry_date": "2026-06-02", "day_status": "WFH"}]},
        )
        assert resp.status_code == status.HTTP_409_CONFLICT, resp.text


def test_self_mark_not_on_anothers_timesheet() -> None:
    with authed_client(ADMIN) as admin:
        _create_structure(admin, employee_id=EMP1)
        _create_structure(admin, employee_id=EMP2)
        cycle = _create_cycle(admin)
        admin.post(f"{TS_BASE}/cycles/{cycle['id']}/generate")
        emp2_ts = next(
            r for r in admin.get(f"{TS_BASE}/cycles/{cycle['id']}").json()
            if r["employee_id"] == EMP2
        )["id"]
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:  # linked to EMP1
        resp = emp.put(
            f"{ME_BASE}/timesheets/{emp2_ts}/mark",
            json={"entries": [{"entry_date": "2026-06-02", "day_status": "WFH"}]},
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND, resp.text


def test_employee_cannot_cancel_another_employees_leave() -> None:
    with authed_client(ADMIN) as admin:
        lt = _create_leave_type(admin)
        # A leave request filed (by HR) for EMP2.
        other = admin.post(
            f"{LEAVE_BASE}/requests",
            json={"employee_id": EMP2, "leave_type_id": lt["id"],
                  "start_date": "2026-06-02", "end_date": "2026-06-02"},
        )
        assert other.status_code == status.HTTP_201_CREATED, other.text
        other_id = other.json()["id"]
        assert _create_user(admin).status_code == status.HTTP_201_CREATED

    with authed_client(EMP_USER) as emp:
        # EMP1's login cannot touch EMP2's request — 404 (not found for them).
        resp = emp.post(f"{ME_BASE}/leave/requests/{other_id}/cancel", json={})
        assert resp.status_code == status.HTTP_404_NOT_FOUND
