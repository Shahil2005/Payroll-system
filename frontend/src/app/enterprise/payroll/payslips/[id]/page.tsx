"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  payrollApi,
  inr,
  type Employee,
  type PayrollCycle,
  type Payslip,
} from "@/utils/api";
import { Banner, PayslipBadge } from "@/components/ui";

export default function PayslipDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await payrollApi.getPayslip(id);
        setSlip(p);
        const [c, emps] = await Promise.all([
          payrollApi.getCycle(p.cycle_id),
          payrollApi.listEmployees(),
        ]);
        setCycle(c);
        setEmployee(emps.find((e) => e.id === p.employee_id) ?? null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;
  if (error) return <div className="p-6"><Banner>{error}</Banner></div>;
  if (!slip || !cycle) return <p className="p-12 text-center text-[var(--color-muted)]">Payslip not found.</p>;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between no-print">
        <Link href={`/enterprise/payroll/${slip.cycle_id}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)]">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Cycle
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <span className="material-symbols-outlined text-[18px]">print</span> Print
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 print:border-0">
        <div className="mb-6 flex items-start justify-between border-b border-[var(--color-border)] pb-5">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">CROAR</div>
            <div className="text-xs text-[var(--color-muted)]">Croar Technologies Pvt Ltd</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">PAYSLIP</div>
            <div className="text-xs text-[var(--color-muted)]">Ref #{slip.id.slice(0, 8)}</div>
            <div className="mt-1"><PayslipBadge status={slip.status} /></div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:grid-cols-4">
          <Info label="Employee" value={employee ? `${employee.first_name} ${employee.last_name}` : slip.employee_id.slice(0, 8)} />
          <Info label="Email" value={employee?.email ?? "—"} />
          <Info label="Period" value={`${cycle.period_start} → ${cycle.period_end}`} />
          <Info label="Pay Date" value={cycle.pay_date} />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Breakdown title="Earnings" lines={slip.earnings ?? []} currency={slip.currency} total={Number(slip.gross_earnings)} totalLabel="Gross Earnings" />
          <Breakdown title="Deductions" lines={slip.deductions ?? []} currency={slip.currency} total={Number(slip.total_deductions)} totalLabel="Total Deductions" negative />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center text-sm">
          <Info label="Working Days" value={String(DEFAULT_WD)} center />
          <Info label="LOP Days" value={String(Number(slip.lop_days))} center />
          <Info label="Paid Days" value={String(Number(slip.paid_days ?? 0))} center />
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-5">
          <span className="text-sm text-[var(--color-muted)]">Net Payable</span>
          <span className="text-3xl font-extrabold text-[var(--color-accent)]">{inr(slip.net_pay, slip.currency)}</span>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_WD = 30;

function Info({ label, value, center = false }: { label: string; value: string; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      <div className="text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Breakdown({
  title,
  lines,
  currency,
  total,
  totalLabel,
  negative = false,
}: {
  title: string;
  lines: { code: string; label: string; amount: number }[];
  currency: string;
  total: number;
  totalLabel: string;
  negative?: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2 border-b border-[var(--color-border)] pb-2 font-bold">{title}</h4>
      <div className="min-h-24">
        {lines.length === 0 ? (
          <p className="py-2 text-sm text-[var(--color-muted)]">None</p>
        ) : (
          lines.map((l) => (
            <div key={l.code} className="flex justify-between py-1.5 text-sm">
              <span>{l.label}</span>
              <span className="font-medium">
                {negative ? "- " : ""}
                {inr(l.amount, currency)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 font-bold">
        <span>{totalLabel}</span>
        <span className={negative ? "text-[var(--color-danger)]" : ""}>
          {negative ? "- " : ""}
          {inr(total, currency)}
        </span>
      </div>
    </div>
  );
}
