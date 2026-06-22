"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { meApi, type Timesheet } from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";

export default function MyTimesheetsPage() {
  const [rows, setRows] = useState<Timesheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    meApi
      .timesheets()
      .then(setRows)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">My Timesheets</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        Your attendance for each pay period. Read-only — contact HR for corrections.
      </p>

      {error && <Banner>{error}</Banner>}

      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center text-sm text-[var(--color-muted)]">
          No timesheets yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3">LOP</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ts) => (
                <tr key={ts.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {ts.period_start} → {ts.period_end}
                  </td>
                  <td className="px-4 py-3">{Number(ts.worked_days)}</td>
                  <td className="px-4 py-3">{Number(ts.lop_days)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ts.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/employee/timesheets/${ts.id}`}
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
