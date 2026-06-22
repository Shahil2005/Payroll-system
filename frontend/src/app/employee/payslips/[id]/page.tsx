"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { meApi, type MyPayslip, type ResolvedLine } from "@/utils/api";
import { Banner } from "@/components/ui";

const money = (n: number | string, currency = "INR") =>
  Number(n).toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 2 });

function LineTable({
  title,
  lines,
  currency,
}: {
  title: string;
  lines: ResolvedLine[];
  currency: string;
}) {
  if (!lines || lines.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.code}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-4 py-2.5">{l.label}</td>
              <td className="px-4 py-2.5 text-right font-medium">{money(l.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MyPayslipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [ps, setPs] = useState<MyPayslip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    meApi
      .payslip(id)
      .then(setPs)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  if (error) return <Banner>{error}</Banner>;
  if (!ps) return <p className="text-[var(--color-muted)]">Loading…</p>;

  const currency = ps.currency || "INR";

  return (
    <div>
      <Link
        href="/employee/payslips"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        My Payslips
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">
        {ps.cycle_name || `${ps.period_start} → ${ps.period_end}`}
      </h1>
      <p className="mb-5 text-sm text-[var(--color-muted)]">Pay date {ps.pay_date}</p>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Gross earnings", value: ps.gross_earnings },
          { label: "Total deductions", value: ps.total_deductions },
          { label: "Net pay", value: ps.net_pay },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{s.label}</div>
            <div className="text-xl font-bold">{money(s.value, currency)}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <LineTable title="Earnings" lines={ps.earnings ?? []} currency={currency} />
        <LineTable title="Deductions" lines={ps.deductions ?? []} currency={currency} />
      </div>
    </div>
  );
}
