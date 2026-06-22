"use client";

import { useEffect, useState } from "react";
import {
  meApi,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
} from "@/utils/api";
import { Banner, Modal, StatusBadge } from "@/components/ui";
import { useDialog } from "@/components/DialogProvider";

const EMPTY = { leave_type_id: "", start_date: "", end_date: "", half_day: false, reason: "" };

export default function MyLeavePage() {
  const { confirm } = useDialog();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  async function load() {
    try {
      const [b, r, t] = await Promise.all([
        meApi.leaveBalances(),
        meApi.leaveRequests(),
        meApi.leaveTypes(),
      ]);
      setBalances(b);
      setRequests(r);
      setTypes(t);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      await meApi.fileLeave({
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.half_day ? form.start_date : form.end_date,
        half_day: form.half_day,
        reason: form.reason || null,
      });
      setOpen(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!(await confirm("Cancel this leave request?"))) return;
    setBusy(true);
    try {
      await meApi.cancelLeave(id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Leave</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Your leave balances and requests. Requests go to HR for approval.
          </p>
        </div>
        <button
          onClick={() => {
            setFormErr(null);
            setForm(EMPTY);
            setOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Request Leave
        </button>
      </div>

      {error && <Banner>{error}</Banner>}

      {/* Balances */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {balances.map((b) => (
          <div key={b.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {b.leave_type_name || b.leave_type_code}
            </div>
            <div className="text-xl font-bold">{Number(b.balance)}</div>
            <div className="text-xs text-[var(--color-dim)]">
              {Number(b.used)} used of {Number(b.accrued)}
            </div>
          </div>
        ))}
        {balances.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No leave balances yet.</p>
        )}
      </div>

      {/* Requests */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        My Requests
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3 font-medium">{r.leave_type_name || r.leave_type_code}</td>
                <td className="px-4 py-3 text-[var(--color-muted)]">
                  {r.start_date}
                  {r.end_date !== r.start_date ? ` → ${r.end_date}` : ""}
                  {r.half_day ? " (½)" : ""}
                </td>
                <td className="px-4 py-3">{Number(r.days)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {(r.status === "PENDING" || r.status === "APPROVED") && (
                    <button
                      onClick={() => cancel(r.id)}
                      disabled={busy}
                      className="font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No leave requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Request Leave" onClose={() => setOpen(false)}>
          <form onSubmit={apply} className="flex flex-col gap-4">
            {formErr && <Banner>{formErr}</Banner>}
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Leave Type</span>
              <select
                className="input"
                required
                value={form.leave_type_id}
                onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
              >
                <option value="" disabled>
                  Select…
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}){t.is_paid ? "" : " — unpaid"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.half_day}
                onChange={(e) => setForm({ ...form, half_day: e.target.checked })}
              />
              <span className="text-sm">Half day</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">{form.half_day ? "Date" : "Start date"}</span>
              <input
                className="input"
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </label>
            {!form.half_day && (
              <label className="flex flex-col gap-1.5">
                <span className="lbl">End date</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Reason (optional)</span>
              <textarea
                className="input"
                rows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Submitting…" : "Submit Request"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
