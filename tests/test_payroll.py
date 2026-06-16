"""Payroll module tests.

New test infrastructure notes (calling out as required by plan):
- Uses psycopg2 (sync) for DB fixture truncation/seeding so the asyncpg
  connection pool is never touched by the fixture.
- Each integration test creates its own TestClient context manager so the
  anyio portal (and the asyncpg pool it owns) is torn down and recreated
  fresh per test, avoiding "another operation is in progress" errors on
  Windows ProactorEventLoop.
- compute_payslip is a plain def (pure Decimal math), so unit tests call
  it directly without any asyncio involvement.
"""
from decimal import Decimal
from typing import Any, Generator

import psycopg2
import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.constants import PayrollCycleStatus, PayslipStatus
from app.main import app
from app.models.payroll import SalaryStructure
from app.services.payroll_service import compute_payslip

# Sync DSN — keeps asyncpg pool untouched
_DSN = "host=localhost port=5432 dbname=payroll_test user=postgres password=mysql"


# ---------------------------------------------------------------------------
# DB fixture — psycopg2 only, no asyncio
# ---------------------------------------------------------------------------

def _reset_db() -> None:
    """Truncate all payroll tables and re-seed two test users."""
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE payslip CASCADE;")
    cur.execute("TRUNCATE TABLE salary_structure CASCADE;")
    cur.execute("TRUNCATE TABLE payroll_cycle CASCADE;")
    cur.execute('TRUNCATE TABLE "user" CASCADE;')
    # user 1 — will have salary structures in tests
    cur.execute(
        'INSERT INTO "user" (id, username, slug, email, first_name, last_name, password) '
        "VALUES (1, 'john_doe', 'john-doe', 'john@example.com', 'John', 'Doe', 'pw');"
    )
    # user 2 — intentionally has NO salary structure → skipped during run_payroll
    cur.execute(
        'INSERT INTO "user" (id, username, slug, email, first_name, last_name, password) '
        "VALUES (2, 'jane_doe', 'jane-doe', 'jane@example.com', 'Jane', 'Doe', 'pw');"
    )
    cur.close()
    conn.close()


@pytest.fixture(autouse=True)
def db_setup() -> Generator[None, None, None]:
    """Clean + seed before each test; truncate after."""
    _reset_db()
    yield
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE payslip CASCADE;")
    cur.execute("TRUNCATE TABLE salary_structure CASCADE;")
    cur.execute("TRUNCATE TABLE payroll_cycle CASCADE;")
    cur.execute('TRUNCATE TABLE "user" CASCADE;')
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_struct(**overrides: Any) -> SalaryStructure:
    """Build a SalaryStructure for unit tests (no DB required)."""
    defaults: dict[str, Any] = {
        "ctc": Decimal("1200000.00"),
        "currency": "INR",
        "components": {
            "basic": {"type": "percentage", "value": "50"},
            "allowance": {"type": "fixed", "value": "10000"},
        },
        "default_deductions": {
            "pf": {"type": "percentage", "value": "12"},
            "tax": {"type": "fixed", "value": "5000"},
        },
    }
    defaults.update(overrides)
    return SalaryStructure(**defaults)


def _create_structure(client: TestClient, employee_id: int = 1, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ctc": 1200000.00,
        "currency": "INR",
        "pay_frequency": "MONTHLY",
        "effective_from": "2026-06-01",
        "components": {
            "basic": {"type": "percentage", "value": 50},
            "hra": {"type": "fixed", "value": 15000},
        },
        "default_deductions": {"pf": {"type": "percentage", "value": 12}},
        "is_active": True,
        "employee_id": employee_id,
    }
    payload.update(overrides)
    resp = client.post("/api/v1/payroll/structures", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()  # type: ignore[no-any-return]


def _create_cycle(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "June 2026 Payroll",
        "period_start": "2026-06-01",
        "period_end": "2026-06-30",
        "pay_date": "2026-06-30",
        "notes": "Test cycle",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/payroll/cycles", json=payload)
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Unit Tests — compute_payslip (pure math, no DB, no asyncio)
# ---------------------------------------------------------------------------

def test_compute_payslip_no_lop() -> None:
    """Full-month pay with zero LOP days."""
    # CTC 1,200,000 → monthly 100,000
    # basic 50% = 50,000 | allowance fixed = 10,000 → gross 60,000
    # pf 12% of 60k = 7,200 | tax fixed = 5,000 → net 47,800
    struct = _make_struct()
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("30.00"))

    assert res["gross_earnings"] == Decimal("60000.00")
    assert res["total_deductions"] == Decimal("12200.00")
    assert res["net_pay"] == Decimal("47800.00")
    assert res["paid_days"] == Decimal("30.00")
    assert res["earnings"]["basic"] == 50000.00
    assert res["earnings"]["allowance"] == 10000.00
    assert res["deductions"]["pf"] == 7200.00
    assert res["deductions"]["tax"] == 5000.00


def test_compute_payslip_fixed_earning_component() -> None:
    """Fixed earning component — exact value, no scaling."""
    struct = _make_struct(
        components={"salary": {"type": "fixed", "value": "25000"}},
        default_deductions={},
    )
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("30.00"))
    assert res["gross_earnings"] == Decimal("25000.00")
    assert res["earnings"]["salary"] == 25000.00


def test_compute_payslip_percentage_earning_component() -> None:
    """Percentage earning is % of (CTC / 12)."""
    struct = _make_struct(
        components={"hra": {"type": "percentage", "value": "40"}},
        default_deductions={},
    )
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("30.00"))
    assert res["gross_earnings"] == Decimal("40000.00")
    assert res["earnings"]["hra"] == 40000.00


def test_compute_payslip_with_lop_proration() -> None:
    """LOP proration: each component scaled by paid_days / working_days."""
    # 30 working, 3 LOP → multiplier 0.9
    # basic 50k*0.9=45,000 | allowance 10k*0.9=9,000 → gross 54,000
    # pf 12% of 54k=6,480 | tax 5k (fixed, not prorated) = 5,000 → ded 11,480 → net 42,520
    struct = _make_struct()
    res = compute_payslip(struct, lop_days=Decimal("3.00"), working_days=Decimal("30.00"))
    assert res["paid_days"] == Decimal("27.00")
    assert res["gross_earnings"] == Decimal("54000.00")
    assert res["total_deductions"] == Decimal("11480.00")
    assert res["net_pay"] == Decimal("42520.00")


def test_compute_payslip_deduction_percentage_of_gross() -> None:
    """Percentage deduction is of actual prorated gross, not CTC."""
    struct = _make_struct(
        components={"basic": {"type": "fixed", "value": "30000"}},
        default_deductions={"pf": {"type": "percentage", "value": "12"}},
    )
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("30.00"))
    assert res["deductions"]["pf"] == 3600.00
    assert res["total_deductions"] == Decimal("3600.00")
    assert res["net_pay"] == Decimal("26400.00")


def test_compute_payslip_deduction_fixed() -> None:
    """Fixed deduction amount is exact."""
    struct = _make_struct(
        components={"basic": {"type": "fixed", "value": "30000"}},
        default_deductions={"tds": {"type": "fixed", "value": "3000"}},
    )
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("30.00"))
    assert res["deductions"]["tds"] == 3000.00
    assert res["net_pay"] == Decimal("27000.00")


def test_compute_payslip_rounding_half_up() -> None:
    """Amounts rounded to 2 dp with ROUND_HALF_UP."""
    struct = _make_struct(
        ctc=Decimal("123456.78"),
        currency="USD",
        components={"basic": {"type": "percentage", "value": "33.33"}},
        default_deductions={"tax": {"type": "percentage", "value": "10.05"}},
    )
    res = compute_payslip(struct, lop_days=Decimal("0.00"), working_days=Decimal("31.00"))
    assert res["gross_earnings"] == Decimal("3429.01")
    assert res["total_deductions"] == Decimal("344.62")
    assert res["net_pay"] == Decimal("3084.39")


# ---------------------------------------------------------------------------
# Integration Tests — each creates a fresh TestClient to isolate asyncpg pool
# ---------------------------------------------------------------------------

def test_payroll_lifecycle() -> None:
    """Full lifecycle: DRAFT → run → PROCESSING → approve → APPROVED → mark-paid → PAID."""
    with TestClient(app) as c:
        _create_structure(c, employee_id=1)

        # Duplicate active structure → 409
        resp = c.post(
            "/api/v1/payroll/structures",
            json={
                "ctc": 1200000.0, "currency": "INR", "pay_frequency": "MONTHLY",
                "effective_from": "2026-06-01",
                "components": {"basic": {"type": "percentage", "value": 50}},
                "default_deductions": {}, "is_active": True, "employee_id": 1,
            },
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

        cycle = _create_cycle(c)
        cycle_id: int = cycle["id"]
        assert cycle["status"] == PayrollCycleStatus.DRAFT

        # Run payroll — John processed, Jane skipped (no structure)
        resp = c.post(f"/api/v1/payroll/cycles/{cycle_id}/run")
        assert resp.status_code == status.HTTP_200_OK
        run = resp.json()
        assert run["created"] == 1
        assert run["updated"] == 0
        assert len(run["skipped"]) == 1
        assert run["skipped"][0]["employee_id"] == 2

        # Verify PROCESSING + totals
        resp = c.get(f"/api/v1/payroll/cycles/{cycle_id}")
        c_data = resp.json()
        assert c_data["status"] == PayrollCycleStatus.PROCESSING
        assert c_data["totals"]["gross_earnings"] == 65000.0   # basic 50k + hra 15k
        assert c_data["totals"]["total_deductions"] == 7800.0  # pf 12% of 65k
        assert c_data["totals"]["net_pay"] == 57200.0

        # Invalid: re-run on PROCESSING → 409
        assert c.post(f"/api/v1/payroll/cycles/{cycle_id}/run").status_code == status.HTTP_409_CONFLICT
        # Invalid: delete non-DRAFT → 409
        assert c.delete(f"/api/v1/payroll/cycles/{cycle_id}").status_code == status.HTTP_409_CONFLICT

        # Approve
        resp = c.post(f"/api/v1/payroll/cycles/{cycle_id}/approve")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == PayrollCycleStatus.APPROVED

        # Invalid: approve again → 409
        assert c.post(f"/api/v1/payroll/cycles/{cycle_id}/approve").status_code == status.HTTP_409_CONFLICT
        # Invalid: run APPROVED → 409
        assert c.post(f"/api/v1/payroll/cycles/{cycle_id}/run").status_code == status.HTTP_409_CONFLICT

        # Mark paid
        resp = c.post(f"/api/v1/payroll/cycles/{cycle_id}/mark-paid")
        assert resp.status_code == status.HTTP_200_OK
        paid = resp.json()
        assert paid["status"] == PayrollCycleStatus.PAID
        assert paid["paid_at"] is not None

        # Invalid: mark-paid again → 409
        assert c.post(f"/api/v1/payroll/cycles/{cycle_id}/mark-paid").status_code == status.HTTP_409_CONFLICT

        # All payslips → PAID
        resp = c.get(f"/api/v1/payroll/cycles/{cycle_id}/payslips")
        payslips = resp.json()
        assert len(payslips) == 1
        assert payslips[0]["status"] == PayslipStatus.PAID
        assert payslips[0]["paid_at"] is not None

        # Payslip detail
        resp = c.get(f"/api/v1/payroll/payslips/{payslips[0]['id']}")
        assert resp.status_code == status.HTTP_200_OK
        detail = resp.json()
        assert detail["earnings"]["basic"] == 50000.0
        assert detail["deductions"]["pf"] == 7800.0


def test_run_payroll_idempotency() -> None:
    """Re-running payroll on DRAFT cycle updates existing payslips (idempotent)."""
    with TestClient(app) as c:
        _create_structure(c, employee_id=1,
                          components={"basic": {"type": "fixed", "value": 25000}},
                          default_deductions={})
        cycle = _create_cycle(c, name="Idempotency Test")
        cycle_id: int = cycle["id"]

        # First run → creates 1 payslip
        resp = c.post(f"/api/v1/payroll/cycles/{cycle_id}/run")
        assert resp.status_code == status.HTTP_200_OK
        r1 = resp.json()
        assert r1["created"] == 1
        assert r1["updated"] == 0

    # Reset cycle to DRAFT via psycopg2
    conn = psycopg2.connect(_DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"UPDATE payroll_cycle SET status = 'DRAFT' WHERE id = {cycle_id};")
    cur.close()
    conn.close()

    # Fresh client — second run updates the existing payslip
    with TestClient(app) as c:
        resp = c.post(f"/api/v1/payroll/cycles/{cycle_id}/run")
        assert resp.status_code == status.HTTP_200_OK
        r2 = resp.json()
        assert r2["created"] == 0
        assert r2["updated"] == 1


def test_soft_delete_salary_structure() -> None:
    """Soft-delete: sets deleted_at/is_active=False; hidden from list and GET."""
    with TestClient(app) as c:
        created = _create_structure(c, employee_id=1)
        struct_id: int = created["id"]

        # Soft-delete
        resp = c.delete(f"/api/v1/payroll/structures/{struct_id}")
        assert resp.status_code == status.HTTP_200_OK
        deleted = resp.json()
        assert deleted["deleted_at"] is not None
        assert deleted["is_active"] is False

        # List should be empty
        assert len(c.get("/api/v1/payroll/structures").json()) == 0

        # GET by ID → 404
        assert c.get(f"/api/v1/payroll/structures/{struct_id}").status_code == status.HTTP_404_NOT_FOUND

        # Re-creating active structure after deletion succeeds
        new = _create_structure(c, employee_id=1)
        assert new["id"] != struct_id


def test_state_transition_draft_to_processing() -> None:
    """DRAFT → PROCESSING via run_payroll."""
    with TestClient(app) as c:
        _create_structure(c, employee_id=1)
        cycle = _create_cycle(c)
        cycle_id: int = cycle["id"]

        assert c.post(f"/api/v1/payroll/cycles/{cycle_id}/run").status_code == status.HTTP_200_OK
        assert c.get(f"/api/v1/payroll/cycles/{cycle_id}").json()["status"] == PayrollCycleStatus.PROCESSING


def test_state_transition_invalid_approve_from_draft() -> None:
    """Cannot approve a DRAFT cycle — must run first."""
    with TestClient(app) as c:
        cycle = _create_cycle(c)
        assert c.post(f"/api/v1/payroll/cycles/{cycle['id']}/approve").status_code == status.HTTP_409_CONFLICT


def test_state_transition_invalid_mark_paid_from_draft() -> None:
    """Cannot mark-paid a DRAFT cycle directly."""
    with TestClient(app) as c:
        cycle = _create_cycle(c)
        assert (
            c.post(f"/api/v1/payroll/cycles/{cycle['id']}/mark-paid").status_code
            == status.HTTP_409_CONFLICT
        )
