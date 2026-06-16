"""Payroll module tests (spec-conformant: UUID, companies/employees, array
components with percent_of, /api/v1/enterprise/payroll).

Infra notes (unchanged rationale):
- psycopg2 (sync) for fixture truncation/seeding so the asyncpg pool is untouched.
- Each integration test uses its own TestClient context so the anyio portal
  (and asyncpg pool) is recreated per test (Windows ProactorEventLoop safety).
- compute_payslip is pure Decimal math, called directly in unit tests.
"""
import contextlib
from decimal import Decimal
from typing import Any, Generator, Iterator

import psycopg2
import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.constants import PayrollCycleStatus, PayslipStatus
from app.core.security import hash_password
from app.main import app
from app.models.payroll import SalaryStructure
from app.services.payroll_service import compute_payslip

_DSN = "host=localhost port=5432 dbname=payroll_test user=postgres password=mysql"

COMPANY_ID = "00000000-0000-0000-0000-000000000001"
EMP1 = "11111111-1111-1111-1111-111111111111"  # has a salary structure
EMP2 = "22222222-2222-2222-2222-222222222222"  # no structure -> skipped

ADMIN = ("admin@croar.com", "admin123")
VIEWER = ("viewer@croar.com", "viewer123")


def _reset_db() -> None:
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE payslips CASCADE;")
    cur.execute("TRUNCATE TABLE salary_structures CASCADE;")
    cur.execute("TRUNCATE TABLE payroll_cycles CASCADE;")
    cur.execute("TRUNCATE TABLE employees CASCADE;")
    # Ensure the default scoping company exists.
    cur.execute(
        "INSERT INTO companies (id, name, currency, created_at, updated_at) "
        "VALUES (%s, 'Croar Technologies', 'INR', now(), now()) "
        "ON CONFLICT (id) DO NOTHING;",
        (COMPANY_ID,),
    )
    for emp_id, first in ((EMP1, "John"), (EMP2, "Jane")):
        cur.execute(
            "INSERT INTO employees (id, company_id, first_name, last_name, email, "
            "created_at, updated_at) VALUES (%s, %s, %s, 'Doe', %s, now(), now());",
            (emp_id, COMPANY_ID, first, f"{first.lower()}@example.com"),
        )
    # Ensure auth users exist (idempotent; survives across runs).
    for email, pw, role in (
        (ADMIN[0], ADMIN[1], "ADMIN"),
        (VIEWER[0], VIEWER[1], "VIEWER"),
    ):
        cur.execute(
            "INSERT INTO users (company_id, email, full_name, hashed_password, "
            "role, is_active, created_at, updated_at) VALUES "
            "(%s, %s, %s, %s, %s, true, now(), now()) "
            "ON CONFLICT (company_id, email) DO NOTHING;",
            (COMPANY_ID, email, email, hash_password(pw), role),
        )
    cur.close()
    conn.close()


def _token(client: TestClient, email: str, password: str) -> str:
    resp = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == status.HTTP_200_OK, resp.text
    return resp.json()["access_token"]


@contextlib.contextmanager
def authed_client(creds: tuple[str, str] = ADMIN) -> Iterator[TestClient]:
    """A TestClient with a Bearer token pre-set for the given user."""
    with TestClient(app) as c:
        token = _token(c, *creds)
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


@pytest.fixture(autouse=True)
def db_setup() -> Generator[None, None, None]:
    _reset_db()
    yield
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE payslips CASCADE;")
    cur.execute("TRUNCATE TABLE salary_structures CASCADE;")
    cur.execute("TRUNCATE TABLE payroll_cycles CASCADE;")
    cur.execute("TRUNCATE TABLE employees CASCADE;")
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_struct(**overrides: Any) -> SalaryStructure:
    defaults: dict[str, Any] = {
        "ctc": Decimal("1200000.00"),
        "currency": "INR",
        "components": [
            {"code": "BASIC", "label": "Basic", "type": "fixed", "amount": 40000},
            {"code": "HRA", "label": "HRA", "type": "percent", "percent": 40, "percent_of": "BASIC"},
            {"code": "SPECIAL", "label": "Special Allowance", "type": "fixed", "amount": 15000},
        ],
        "default_deductions": [
            {"code": "PF", "label": "Provident Fund", "type": "fixed", "amount": 1800},
        ],
    }
    defaults.update(overrides)
    return SalaryStructure(**defaults)


def _create_structure(client: TestClient, employee_id: str = EMP1, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "employee_id": employee_id,
        "ctc": 1200000.00,
        "currency": "INR",
        "pay_frequency": "MONTHLY",
        "effective_from": "2026-06-01",
        "components": [
            {"code": "BASIC", "label": "Basic", "type": "fixed", "amount": 40000},
            {"code": "HRA", "label": "HRA", "type": "percent", "percent": 40, "percent_of": "BASIC"},
        ],
        "default_deductions": [
            {"code": "PF", "label": "Provident Fund", "type": "fixed", "amount": 1800},
        ],
        "is_active": True,
    }
    payload.update(overrides)
    resp = client.post("/api/v1/enterprise/payroll/structures", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


def _create_cycle(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "June 2026",
        "period_start": "2026-06-01",
        "period_end": "2026-06-30",
        "pay_date": "2026-07-01",
        "notes": "Test cycle",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/enterprise/payroll/cycles", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Unit tests — compute_payslip (array shape + percent_of)
# ---------------------------------------------------------------------------
def test_compute_basic_hra_percent_of_special() -> None:
    """BASIC 40000 + HRA 40% of BASIC (16000) + SPECIAL 15000 -> gross 71000."""
    res = compute_payslip(_make_struct(), Decimal("0"), Decimal("30"))
    assert res["gross_earnings"] == Decimal("71000.00")
    assert res["total_deductions"] == Decimal("1800.00")
    assert res["net_pay"] == Decimal("69200.00")
    hra = next(e for e in res["earnings"] if e["code"] == "HRA")
    assert hra["amount"] == 16000.00


def test_compute_percent_of_gross_when_omitted() -> None:
    """A percent deduction with no percent_of is a percent of gross."""
    struct = _make_struct(
        components=[{"code": "BASIC", "label": "Basic", "type": "fixed", "amount": 30000}],
        default_deductions=[{"code": "TAX", "label": "Tax", "type": "percent", "percent": 10}],
    )
    res = compute_payslip(struct, Decimal("0"), Decimal("30"))
    assert res["gross_earnings"] == Decimal("30000.00")
    assert res["total_deductions"] == Decimal("3000.00")
    assert res["net_pay"] == Decimal("27000.00")


def test_compute_lop_proration() -> None:
    """LOP 3/30 -> earnings pro-rated by 0.9; fixed deduction not pro-rated."""
    res = compute_payslip(_make_struct(), Decimal("3"), Decimal("30"))
    assert res["paid_days"] == Decimal("27")
    # 36000 + 14400 + 13500 = 63900
    assert res["gross_earnings"] == Decimal("63900.00")
    assert res["total_deductions"] == Decimal("1800.00")
    assert res["net_pay"] == Decimal("62100.00")


def test_compute_rounding_half_up() -> None:
    struct = _make_struct(
        components=[{"code": "BASIC", "label": "Basic", "type": "fixed", "amount": "10000.005"}],
        default_deductions=[],
    )
    res = compute_payslip(struct, Decimal("0"), Decimal("30"))
    assert res["gross_earnings"] == Decimal("10000.01")


def test_compute_invalid_lop() -> None:
    with pytest.raises(ValueError):
        compute_payslip(_make_struct(), Decimal("31"), Decimal("30"))


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------
def test_payroll_lifecycle() -> None:
    """DRAFT -> run -> PROCESSING -> approve -> mark-paid -> PAID."""
    with authed_client() as c:
        _create_structure(c, employee_id=EMP1)

        # Duplicate active structure -> 409
        dup = c.post(
            "/api/v1/enterprise/payroll/structures",
            json={
                "employee_id": EMP1, "ctc": 1200000.0, "effective_from": "2026-06-01",
                "components": [{"code": "BASIC", "label": "Basic", "type": "fixed", "amount": 40000}],
                "default_deductions": [], "is_active": True,
            },
        )
        assert dup.status_code == status.HTTP_409_CONFLICT

        cycle = _create_cycle(c)
        cid = cycle["id"]
        assert cycle["status"] == PayrollCycleStatus.DRAFT

        run = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run")
        assert run.status_code == status.HTTP_200_OK, run.text
        body = run.json()
        assert body["created"] == 1
        assert body["updated"] == 0
        assert len(body["skipped"]) == 1
        assert body["skipped"][0]["employee_id"] == EMP2

        got = c.get(f"/api/v1/enterprise/payroll/cycles/{cid}").json()
        assert got["status"] == PayrollCycleStatus.PROCESSING
        # BASIC 40000 + HRA 40% of BASIC 16000 = 56000 gross; PF 1800 fixed
        assert got["totals"]["headcount"] == 1
        assert got["totals"]["gross"] == 56000.0
        assert got["totals"]["deductions"] == 1800.0
        assert got["totals"]["net"] == 54200.0

        # Payslips stay hidden until the cycle is PAID (PROCESSING -> empty list)
        assert c.get(f"/api/v1/enterprise/payroll/cycles/{cid}/payslips").json() == []

        # Re-run on PROCESSING is allowed (idempotent refresh)
        rerun = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run")
        assert rerun.status_code == status.HTTP_200_OK
        assert rerun.json()["updated"] == 1

        approve = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/approve")
        assert approve.status_code == status.HTTP_200_OK
        assert approve.json()["status"] == PayrollCycleStatus.APPROVED

        # Still hidden while APPROVED; direct payslip fetch is forbidden pre-PAID
        assert c.get(f"/api/v1/enterprise/payroll/cycles/{cid}/payslips").json() == []
        conn = psycopg2.connect(_DSN)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT id FROM payslips WHERE cycle_id = %s;", (cid,))
        hidden_slip_id = cur.fetchone()[0]
        cur.close()
        conn.close()
        assert (
            c.get(f"/api/v1/enterprise/payroll/payslips/{hidden_slip_id}").status_code
            == status.HTTP_403_FORBIDDEN
        )

        # Run after approve -> 409 (locked)
        assert c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run").status_code == status.HTTP_409_CONFLICT

        paid = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/mark-paid")
        assert paid.status_code == status.HTTP_200_OK
        assert paid.json()["status"] == PayrollCycleStatus.PAID

        slips = c.get(f"/api/v1/enterprise/payroll/cycles/{cid}/payslips").json()
        assert len(slips) == 1
        assert slips[0]["status"] == PayslipStatus.PAID
        assert slips[0]["paid_at"] is not None

        detail = c.get(f"/api/v1/enterprise/payroll/payslips/{slips[0]['id']}").json()
        codes = {line["code"] for line in detail["earnings"]}
        assert codes == {"BASIC", "HRA"}


def test_run_uses_structure_lop_days() -> None:
    """HR sets lop_days on the salary structure; run pro-rates earnings by it."""
    with authed_client() as c:
        # BASIC 40000 + HRA 40% = 56000 gross; 3 LOP days over 30 -> x0.9
        _create_structure(c, employee_id=EMP1, lop_days=3)
        cid = _create_cycle(c, name="LOP cycle")["id"]
        assert c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run").status_code == status.HTTP_200_OK

        got = c.get(f"/api/v1/enterprise/payroll/cycles/{cid}").json()
        # 36000 + 14400 = 50400 gross; PF 1800 fixed -> 48600 net
        assert got["totals"]["gross"] == 50400.0
        assert got["totals"]["net"] == 48600.0

        c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/approve")
        c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/mark-paid")
        slip = c.get(f"/api/v1/enterprise/payroll/cycles/{cid}/payslips").json()[0]
        assert Decimal(str(slip["lop_days"])) == Decimal("3")
        assert Decimal(str(slip["paid_days"])) == Decimal("27")


def test_run_idempotent_on_draft() -> None:
    with authed_client() as c:
        _create_structure(c, employee_id=EMP1)
        cid = _create_cycle(c, name="Idempotency")["id"]
        r1 = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run").json()
        assert r1["created"] == 1 and r1["updated"] == 0

    # Reset to DRAFT and re-run -> updates, no duplicate
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("UPDATE payroll_cycles SET status = 'DRAFT' WHERE id = %s;", (cid,))
    cur.close()
    conn.close()

    with authed_client() as c:
        r2 = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run").json()
        assert r2["created"] == 0 and r2["updated"] == 1


def test_soft_delete_structure() -> None:
    with authed_client() as c:
        created = _create_structure(c, employee_id=EMP1)
        sid = created["id"]
        assert c.delete(f"/api/v1/enterprise/payroll/structures/{sid}").status_code == status.HTTP_200_OK
        assert len(c.get("/api/v1/enterprise/payroll/structures").json()) == 0
        assert c.get(f"/api/v1/enterprise/payroll/structures/{sid}").status_code == status.HTTP_404_NOT_FOUND
        # Re-create after delete works (partial unique index excludes deleted)
        assert _create_structure(c, employee_id=EMP1)["id"] != sid


def test_structures_filter_by_employee() -> None:
    with authed_client() as c:
        _create_structure(c, employee_id=EMP1)
        all_rows = c.get("/api/v1/enterprise/payroll/structures").json()
        assert len(all_rows) == 1
        filtered = c.get(f"/api/v1/enterprise/payroll/structures?employee_id={EMP2}").json()
        assert filtered == []


def test_cancel_and_soft_delete_cycle() -> None:
    with authed_client() as c:
        cid = _create_cycle(c)["id"]
        cancelled = c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/cancel")
        assert cancelled.status_code == status.HTTP_200_OK
        assert cancelled.json()["status"] == PayrollCycleStatus.CANCELLED

        # Soft-delete (not PAID) -> 200, then hidden from list
        cid2 = _create_cycle(c, name="Delete me")["id"]
        assert c.delete(f"/api/v1/enterprise/payroll/cycles/{cid2}").status_code == status.HTTP_200_OK
        ids = {row["id"] for row in c.get("/api/v1/enterprise/payroll/cycles").json()}
        assert cid2 not in ids


def test_invalid_transitions() -> None:
    with authed_client() as c:
        cid = _create_cycle(c)["id"]
        # approve/mark-paid from DRAFT -> 409
        assert c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/approve").status_code == status.HTTP_409_CONFLICT
        assert c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/mark-paid").status_code == status.HTTP_409_CONFLICT


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------
def test_employee_crud_and_soft_delete() -> None:
    with authed_client() as c:
        rows = c.get("/api/v1/enterprise/employees").json()
        assert len(rows) == 2  # seeded EMP1, EMP2

        new = c.post(
            "/api/v1/enterprise/employees",
            json={"first_name": "Sam", "last_name": "Lee", "email": "sam@example.com"},
        )
        assert new.status_code == status.HTTP_201_CREATED
        new_id = new.json()["id"]
        assert len(c.get("/api/v1/enterprise/employees").json()) == 3

        # Duplicate email in same company -> 409
        dup = c.post(
            "/api/v1/enterprise/employees",
            json={"first_name": "Sam2", "email": "sam@example.com"},
        )
        assert dup.status_code == status.HTTP_409_CONFLICT

        assert c.delete(f"/api/v1/enterprise/employees/{new_id}").status_code == status.HTTP_204_NO_CONTENT
        ids = {e["id"] for e in c.get("/api/v1/enterprise/employees").json()}
        assert new_id not in ids


# ---------------------------------------------------------------------------
# Auth & RBAC (spec §7)
# ---------------------------------------------------------------------------
def test_login_success_and_permissions() -> None:
    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/auth/login",
            json={"email": ADMIN[0], "password": ADMIN[1]},
        )
        assert resp.status_code == status.HTTP_200_OK, resp.text
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["user"]["role"] == "ADMIN"
        assert "payroll:run" in body["user"]["permissions"]


def test_login_bad_credentials() -> None:
    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/auth/login",
            json={"email": ADMIN[0], "password": "wrong"},
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_protected_routes_require_auth() -> None:
    """No token -> 401 on protected endpoints."""
    with TestClient(app) as c:
        assert c.get("/api/v1/enterprise/payroll/cycles").status_code == status.HTTP_401_UNAUTHORIZED
        assert c.get("/api/v1/enterprise/employees").status_code == status.HTTP_401_UNAUTHORIZED


def test_viewer_can_read_but_not_write() -> None:
    """A VIEWER may list but cannot run payroll or create resources (403)."""
    with authed_client(VIEWER) as c:
        # read is allowed
        assert c.get("/api/v1/enterprise/payroll/cycles").status_code == status.HTTP_200_OK
        # create cycle requires payroll:configure -> 403
        bad = c.post(
            "/api/v1/enterprise/payroll/cycles",
            json={
                "name": "Nope",
                "period_start": "2026-06-01",
                "period_end": "2026-06-30",
                "pay_date": "2026-07-01",
            },
        )
        assert bad.status_code == status.HTTP_403_FORBIDDEN


def test_viewer_cannot_run_cycle() -> None:
    """Viewer is blocked from the run action even on an existing cycle."""
    with authed_client(ADMIN) as admin:
        cid = _create_cycle(admin, name="Locked")["id"]
    with authed_client(VIEWER) as viewer:
        resp = viewer.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run")
        assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_users_admin_only() -> None:
    """User administration requires users:manage (ADMIN); viewer gets 403."""
    with authed_client(ADMIN) as c:
        assert c.get("/api/v1/auth/users").status_code == status.HTTP_200_OK
    with authed_client(VIEWER) as c:
        assert c.get("/api/v1/auth/users").status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def test_dashboard_summary() -> None:
    with authed_client() as c:
        # Configure EMP1 and run+approve+pay a cycle so paid totals populate.
        _create_structure(c, employee_id=EMP1)
        cid = _create_cycle(c)["id"]
        c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/run")
        c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/approve")
        c.post(f"/api/v1/enterprise/payroll/cycles/{cid}/mark-paid")

        d = c.get("/api/v1/enterprise/payroll/dashboard")
        assert d.status_code == status.HTTP_200_OK, d.text
        body = d.json()
        assert body["employees"]["total"] == 2
        assert body["employees"]["configured"] == 1
        assert body["employees"]["missing"] == 1
        assert body["active_structures"] == 1
        assert body["cycles"]["total"] == 1
        assert body["cycles"]["by_status"]["PAID"] == 1
        assert float(body["payroll"]["net_paid"]) == 54200.0
        assert body["payroll"]["payslips_paid"] == 1
        assert len(body["recent_cycles"]) == 1


def test_dashboard_requires_auth() -> None:
    with TestClient(app) as c:
        assert c.get("/api/v1/enterprise/payroll/dashboard").status_code == status.HTTP_401_UNAUTHORIZED
