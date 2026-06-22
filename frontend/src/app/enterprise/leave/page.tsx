"use client";

import { useEffect, useMemo, useState } from "react";
import {
  payrollApi,
  leaveApi,
  type AccrualMethod,
  type Employee,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

const num = (v: number | string) =>
  Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const empName = (e: Employee) => `${e.first_name} ${e.last_name}`.trim() || e.email;

export default function LeavePage() {
  const { can } = useAuth();
  const { confirm } = useDialog();
  const canEdit = can("payroll:configure");
  const canApprove = can("payroll:approve");

  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New leave request form.
  const [reqForm, setReqForm] = useState({
    employee_id: "",
    leave_type_id: "",
    start_date: "",
    end_date: "",
    half_day: false,
    reason: "",
  });
  // New leave type form.
  const [typeForm, setTypeForm] = useState<{
    name: string;
    code: string;
    is_paid: boolean;
    annual_quota: number;
    accrual: AccrualMethod;
  }>({ name: "", code: "", is_paid: true, annual_quota: 0, accrual: "ANNUAL" });

  async function loadAll() {
    setLoading(true);
    try {
      const [t, b, r, e] = await Promise.all([
        leaveApi.listTypes(),
        leaveApi.listBalances(),
        leaveApi.listRequests(),
        payrollApi.listEmployees(),
      ]);
      setTypes(t);
      setBalances(b);
      setRequests(r);
      setEmployees(e);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createRequest() {
    const { employee_id, leave_type_id, start_date, end_date } = reqForm;
    if (!employee_id || !leave_type_id || !start_date || !end_date) return;
    await run(async () => {
      await leaveApi.createRequest({
        employee_id,
        leave_type_id,
        start_date,
        end_date: reqForm.half_day ? start_date : end_date,
        half_day: reqForm.half_day,
        reason: reqForm.reason || null,
      });
      setReqForm({
        employee_id: "",
        leave_type_id: "",
        start_date: "",
        end_date: "",
        half_day: false,
        reason: "",
      });
    });
  }

  async function createType() {
    if (!typeForm.name.trim() || !typeForm.code.trim()) return;
    await run(async () => {
      await leaveApi.createType(typeForm);
      setTypeForm({ name: "", code: "", is_paid: true, annual_quota: 0, accrual: "ANNUAL" });
    });
  }

  async function decide(
    r: LeaveRequest,
    action: "approve" | "reject" | "cancel",
  ) {
    const verb = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Cancel";
    if (!(await confirm({ title: `${verb} leave`, message: `${verb} this leave request?` }))) return;
    await run(() =>
      action === "approve"
        ? leaveApi.approveRequest(r.id)
        : action === "reject"
          ? leaveApi.rejectRequest(r.id)
          : leaveApi.cancelRequest(r.id),
    );
  }

  const pending = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests]);
  const history = useMemo(() => requests.filter((r) => r.status !== "PENDING"), [requests]);

  if (loading) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Leave types and balances drive paid-vs-unpaid decisions. Approving a request decrements
          the balance and marks the matching timesheet days (paid leave = no LOP, unpaid = LOP).
        </p>
      </div>

      {error && (
        <div className="mb-4">
          <Banner>{error}</Banner>
        </div>
      )}

      {/* File a leave request */}
      {canEdit && (
        <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <h2 className="mb-3 text-lg font-bold">Apply for leave</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Employee</span>
              <select
                value={reqForm.employee_id}
                onChange={(e) => setReqForm({ ...reqForm, employee_id: e.target.value })}
                className="min-w-[12rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {empName(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Leave type</span>
              <select
                value={reqForm.leave_type_id}
                onChange={(e) => setReqForm({ ...reqForm, leave_type_id: e.target.value })}
                className="min-w-[10rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <option value="">Select…</option>
                {types
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.is_paid ? "paid" : "unpaid"})
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">From</span>
              <input
                type="date"
                value={reqForm.start_date}
                onChange={(e) => setReqForm({ ...reqForm, start_date: e.target.value })}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">To</span>
              <input
                type="date"
                value={reqForm.half_day ? reqForm.start_date : reqForm.end_date}
                disabled={reqForm.half_day}
                onChange={(e) => setReqForm({ ...reqForm, end_date: e.target.value })}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={reqForm.half_day}
                onChange={(e) => setReqForm({ ...reqForm, half_day: e.target.checked })}
                className="h-4 w-4"
              />
              Half day
            </label>
            <button
              onClick={createRequest}
              disabled={busy}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              Submit request
            </button>
          </div>
        </div>
      )}

      {/* Pending requests */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Pending approvals</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--color-dim)]">No pending leave requests.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3 text-right">Days</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{r.leave_type_name || r.leave_type_code}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {r.start_date}
                      {r.start_date !== r.end_date && <> → {r.end_date}</>}
                      {r.half_day && " (½)"}
                    </td>
                    <td className="px-4 py-3 text-right">{num(r.days)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canApprove && (
                          <>
                            <button
                              onClick={() => decide(r, "approve")}
                              disabled={busy}
                              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => decide(r, "reject")}
                              disabled={busy}
                              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => decide(r, "cancel")}
                            disabled={busy}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Balances */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Leave balances</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-[var(--color-dim)]">
            No balances yet — add a paid leave type below.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Entitled</th>
                  <th className="px-4 py-3 text-right">Accrued</th>
                  <th className="px-4 py-3 text-right">Used</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{b.employee_name || b.employee_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{b.leave_type_code || b.leave_type_name}</td>
                    <td className="px-4 py-3 text-right">{num(b.entitled)}</td>
                    <td className="px-4 py-3 text-right">{num(b.accrued)}</td>
                    <td className="px-4 py-3 text-right">{num(b.used)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{num(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leave types config */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="mb-1 text-lg font-bold">Leave types</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Paid types carry an annual quota that accrues into each employee’s balance. Unpaid types
          (loss of pay) always land as LOP.
        </p>

        {types.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1">
            {types.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-xs text-[var(--color-dim)]">{t.code}</span>
                  <span className="ml-2 text-xs text-[var(--color-muted)]">
                    {t.is_paid ? `${num(t.annual_quota)} days/yr · ${t.accrual.toLowerCase()}` : "unpaid (LOP)"}
                  </span>
                  {!t.is_active && <span className="ml-2 text-xs text-[var(--color-dim)]">· inactive</span>}
                </span>
                {canEdit && (
                  <button
                    onClick={() => run(() => leaveApi.updateType(t.id, { is_active: !t.is_active }))}
                    className="text-xs font-semibold text-[var(--color-muted)] hover:underline"
                  >
                    {t.is_active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Name</span>
              <input
                type="text"
                placeholder="Casual Leave"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Code</span>
              <input
                type="text"
                placeholder="CL"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={typeForm.is_paid}
                onChange={(e) => setTypeForm({ ...typeForm, is_paid: e.target.checked })}
                className="h-4 w-4"
              />
              Paid
            </label>
            {typeForm.is_paid && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Quota / yr</span>
                  <input
                    type="number"
                    min={0}
                    value={typeForm.annual_quota}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, annual_quota: Number(e.target.value) })
                    }
                    className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Accrual</span>
                  <select
                    value={typeForm.accrual}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, accrual: e.target.value as AccrualMethod })
                    }
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <option value="ANNUAL">Annual (full up front)</option>
                    <option value="MONTHLY">Monthly (1/12 per month)</option>
                  </select>
                </label>
              </>
            )}
            <button
              onClick={createType}
              disabled={busy}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              Add leave type
            </button>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Recent decisions</h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            <table className="w-full text-sm">
              <tbody>
                {history.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{r.employee_name || r.employee_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{r.leave_type_code}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {r.start_date}
                      {r.start_date !== r.end_date && <> → {r.end_date}</>}
                    </td>
                    <td className="px-4 py-3 text-right">{num(r.days)}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
