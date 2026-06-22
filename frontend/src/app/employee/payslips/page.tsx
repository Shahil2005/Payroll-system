"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { meApi, type MyPayslip } from "@/utils/api";
import { Banner } from "@/components/ui";

const money = (n: number | string, currency = "INR") =>
  Number(n).toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

export default function MyPayslipsPage() {
  const [rows, setRows] = useState<MyPayslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    meApi
      .payslips()
      .then(setRows)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">My Payslips</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Released payslips for your paid pay periods.
      </p>

      {error && <Banner>{error}</Banner>}

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center text-sm text-[var(--color-muted)]">
          No payslips have been released yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Pay date</th>
                <th className="px-4 py-3">Net pay</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-medium">{p.cycle_name || `${p.period_start} → ${p.period_end}`}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{p.pay_date}</td>
                  <td className="px-4 py-3 font-semibold">{money(p.net_pay, p.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/employee/payslips/${p.id}`}
                      className="font-semibold text-[var(--color-primary)] hover:underline"
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
  );
}
