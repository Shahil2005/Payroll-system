"use client";

import { useEffect, useState } from "react";
import {
  payrollApi,
  reportsApi,
  type PayrollCycle,
  type ReportFormat,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";

export default function ReportsPage() {
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    payrollApi
      .listCycles()
      .then(setCycles)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function download(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Export payroll registers and summaries as CSV (opens in Excel) or PDF.
        </p>
      </header>

      {error && <Banner>{error}</Banner>}

      {/* Payroll summary (all cycles) */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Payroll Summary</h3>
            <p className="text-sm text-[var(--color-muted)]">
              Cycle-level totals across every payroll cycle.
            </p>
          </div>
          <div className="flex gap-2">
            <DownloadButton
              label="CSV"
              icon="table_view"
              busy={busy === "summary-csv"}
              onClick={() => download("summary-csv", () => reportsApi.payrollSummary("csv"))}
            />
            <DownloadButton
              label="PDF"
              icon="picture_as_pdf"
              busy={busy === "summary-pdf"}
              onClick={() => download("summary-pdf", () => reportsApi.payrollSummary("pdf"))}
            />
          </div>
        </div>
      </div>

      {/* Salary register per cycle */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h3 className="mb-1 font-semibold">Salary Register</h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Per-employee earnings, deductions and net pay for a cycle. Available once
          a cycle has been run.
        </p>
        {loading ? (
          <p className="py-6 text-center text-[var(--color-muted)]">Loading…</p>
        ) : cycles.length === 0 ? (
          <p className="py-6 text-center text-[var(--color-muted)]">No payroll cycles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Register</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => {
                  const ready = c.status !== "DRAFT";
                  return (
                    <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-3 font-medium">{c.name}</td>
                      <td className="px-3 py-3 text-[var(--color-muted)]">
                        {c.period_start} → {c.period_end}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          {ready ? (
                            <>
                              <DownloadButton
                                label="CSV"
                                icon="table_view"
                                busy={busy === `reg-csv-${c.id}`}
                                onClick={() =>
                                  download(`reg-csv-${c.id}`, () =>
                                    reportsApi.salaryRegister(c.id, "csv")
                                  )
                                }
                              />
                              <DownloadButton
                                label="PDF"
                                icon="picture_as_pdf"
                                busy={busy === `reg-pdf-${c.id}`}
                                onClick={() =>
                                  download(`reg-pdf-${c.id}`, () =>
                                    reportsApi.salaryRegister(c.id, "pdf")
                                  )
                                }
                              />
                            </>
                          ) : (
                            <span className="text-xs italic text-[var(--color-dim)]">
                              Run the cycle first
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadButton({
  label,
  icon,
  busy,
  onClick,
}: {
  label: string;
  icon: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-surface)] disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[18px]">
        {busy ? "hourglass_empty" : icon}
      </span>
      {label}
    </button>
  );
}
