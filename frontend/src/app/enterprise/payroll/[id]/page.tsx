"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  payrollApi,
  type Employee,
  type PayrollCycle,
  type Payslip,
  type SkippedEmployee,
  inr,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

export default function CycleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [skipped, setSkipped] = useState<SkippedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const c = await payrollApi.getCycle(id);
      setCycle(c);
      if (c.status !== "DRAFT") setPayslips(await payrollApi.listCyclePayslips(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    payrollApi.listEmployees().then(setEmployees).catch(() => {});
  }, [id]);

  const name = (eid: string) => {
    const e = employees.find((x) => x.id === eid);
    return e ? `${e.first_name} ${e.last_name}`.trim() : `Employee ${eid.slice(0, 8)}`;
  };

  async function act(fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await payrollApi.runCycle(id);
      setSkipped(res.skipped);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;
  if (!cycle) return <p className="p-12 text-center text-[var(--color-muted)]">Cycle not found.</p>;

  const t = cycle.totals ?? {};

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/enterprise/payroll" className="mb-1 inline-flex items-center gap-1 text-sm text-[var(--color-primary)]">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Payroll
          </Link>
          <h1 className="text-3xl font-bold">{cycle.name}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {cycle.period_start} → {cycle.period_end} · Pay date {cycle.pay_date}
          </p>
        </div>
        <StatusBadge status={cycle.status} />
      </header>

      {error && <Banner>{error}</Banner>}

      {skipped.length > 0 && (
        <Banner tone="warn">
          <div className="mb-1 flex items-center justify-between">
            <strong>
              {skipped.length} employee{skipped.length > 1 ? "s" : ""} skipped — no active salary structure
            </strong>
            <button onClick={() => setSkipped([])} className="text-xs underline">
              Dismiss
            </button>
          </div>
          <ul className="list-disc pl-5">
            {skipped.map((s) => (
              <li key={s.employee_id}>
                {name(s.employee_id)} —{" "}
                <Link href="/enterprise/payroll/structures" className="underline">
                  configure salary
                </Link>
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {cycle.status !== "DRAFT" && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
              <h3 className="mb-4 border-b border-[var(--color-border)] pb-2 font-semibold">Cycle Totals</h3>
              <Row label="Headcount" value={String(t.headcount ?? 0)} />
              <Row label="Gross" value={inr(t.gross ?? 0)} />
              <Row label="Deductions" value={`- ${inr(t.deductions ?? 0)}`} tone="text-[var(--color-danger)]" />
              <div className="mt-2 border-t border-dashed border-[var(--color-border)] pt-2">
                <Row label="Net Payout" value={inr(t.net ?? 0)} big tone="text-[var(--color-accent)]" />
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h3 className="mb-4 border-b border-[var(--color-border)] pb-2 font-semibold">Lifecycle</h3>
            <div className="flex flex-col gap-3">
              {(cycle.status === "DRAFT" || cycle.status === "PROCESSING") && can("payroll:run") && (
                <button onClick={run} disabled={busy} className="btn-primary">
                  {busy ? "Processing…" : cycle.status === "DRAFT" ? "Run Payroll" : "Re-run (Recalculate)"}
                </button>
              )}
              {cycle.status === "PROCESSING" && can("payroll:approve") && (
                <button
                  onClick={() => act(() => payrollApi.approveCycle(id), "Approve this cycle? Payslips will be locked from re-run.")}
                  disabled={busy}
                  className="btn-accent"
                >
                  Approve Payroll
                </button>
              )}
              {cycle.status === "APPROVED" && can("payroll:pay") && (
                <button
                  onClick={() => act(() => payrollApi.markPaidCycle(id), "Mark this cycle as PAID? This records disbursement.")}
                  disabled={busy}
                  className="btn-accent"
                >
                  Mark as Paid
                </button>
              )}
              {cycle.status !== "PAID" && cycle.status !== "CANCELLED" && can("payroll:manage") && (
                <button
                  onClick={() => act(() => payrollApi.cancelCycle(id), "Cancel this cycle?")}
                  disabled={busy}
                  className="rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                >
                  Cancel Cycle
                </button>
              )}
              {cycle.status === "PAID" && (
                <p className="text-center text-sm italic text-[var(--color-muted)]">
                  Cycle disbursed. No further actions.
                </p>
              )}
              {cycle.status === "CANCELLED" && (
                <p className="text-center text-sm italic text-[var(--color-muted)]">This cycle was cancelled.</p>
              )}
              {!can("payroll:run") && !can("payroll:approve") && !can("payroll:pay") && !can("payroll:manage") && (
                <p className="text-center text-sm italic text-[var(--color-muted)]">
                  You have read-only access.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: payslips */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Employee Payslips</h3>
          {cycle.status === "DRAFT" ? (
            <div className="py-12 text-center text-[var(--color-muted)]">
              <span className="material-symbols-outlined mb-2 text-4xl text-[var(--color-dim)]">receipt_long</span>
              <p>Run payroll to generate payslips.</p>
            </div>
          ) : payslips.length === 0 ? (
            <p className="py-8 text-center text-[var(--color-muted)]">No payslips in this cycle.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--color-muted)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">LOP / Paid</th>
                    <th className="px-3 py-3 text-right">Gross</th>
                    <th className="px-3 py-3 text-right">Deductions</th>
                    <th className="px-3 py-3 text-right">Net</th>
                    <th className="px-3 py-3 text-right">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-3 font-medium">{name(p.employee_id)}</td>
                      <td className="px-3 py-3 text-[var(--color-muted)]">
                        {Number(p.lop_days)} / {Number(p.paid_days ?? 0)}
                      </td>
                      <td className="px-3 py-3 text-right">{inr(p.gross_earnings)}</td>
                      <td className="px-3 py-3 text-right text-[var(--color-danger)]">- {inr(p.total_deductions)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{inr(p.net_pay)}</td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/enterprise/payroll/payslips/${p.id}`}
                          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "text-[var(--color-text)]",
  big = false,
}: {
  label: string;
  value: string;
  tone?: string;
  big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className={`font-semibold ${tone} ${big ? "text-2xl" : "text-base"}`}>{value}</span>
    </div>
  );
}
