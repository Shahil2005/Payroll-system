"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { payrollApi, inr, type DashboardSummary } from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

const STATUS_ORDER = ["DRAFT", "PROCESSING", "APPROVED", "PAID", "CANCELLED"] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    payrollApi
      .getDashboard()
      .then(setData)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;
  if (error) return <div className="p-2"><Banner>{error}</Banner></div>;
  if (!data) return null;

  const cur = data.currency;
  const cc = data.current_cycle;
  const firstName = (user?.full_name || user?.email || "").split(/[\s@]/)[0];

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {firstName ? `Welcome back, ${firstName}. ` : ""}Here&apos;s your payroll at a glance.
          </p>
        </div>
        <Link
          href="/enterprise/payroll"
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <span className="material-symbols-outlined text-[20px]">payments</span>
          Go to Payroll
        </Link>
      </header>

      {/* Headline metrics */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric icon="groups" label="Employees" value={data.employees.total} href="/enterprise/employees" />
        <Metric icon="tune" label="Active Structures" value={data.active_structures} href="/enterprise/payroll/structures" />
        <Metric icon="calendar_month" label="Payroll Cycles" value={data.cycles.total} href="/enterprise/payroll" />
        <Metric
          icon="payments"
          label="Net Disbursed (paid)"
          value={inr(data.payroll.net_paid, cur)}
          tone="text-[var(--color-accent)]"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current cycle */}
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--color-border)] pb-3">
            <h2 className="font-semibold">Current Cycle</h2>
            {cc && <StatusBadge status={cc.status} />}
          </div>
          {cc ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-lg font-bold">{cc.name}</div>
                  <div className="text-sm text-[var(--color-muted)]">
                    {cc.period_start} → {cc.period_end} · Pay date {cc.pay_date}
                  </div>
                </div>
                <Link
                  href={`/enterprise/payroll/${cc.id}`}
                  className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                >
                  Manage
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Mini label="Headcount" value={String(cc.headcount)} />
                <Mini label="Net Pay" value={inr(cc.net, cur)} tone="text-[var(--color-accent)]" />
                <Mini label="Pending Net (all)" value={inr(data.payroll.pending_net, cur)} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="material-symbols-outlined text-4xl text-[var(--color-dim)]">event_busy</span>
              <p className="text-[var(--color-muted)]">No payroll cycles yet.</p>
              <Link href="/enterprise/payroll" className="text-sm text-[var(--color-primary)]">
                Create the first cycle →
              </Link>
            </div>
          )}
        </section>

        {/* Salary coverage + status breakdown */}
        <section className="flex flex-col gap-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h2 className="mb-4 font-semibold">Salary Coverage</h2>
            <Coverage
              configured={data.employees.configured}
              total={data.employees.total}
            />
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-[var(--color-muted)]">Configured</span>
              <span className="font-semibold text-[var(--color-accent)]">{data.employees.configured}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-muted)]">Missing setup</span>
              {data.employees.missing > 0 ? (
                <Link href="/enterprise/payroll/structures" className="font-semibold text-[var(--color-danger)] underline">
                  {data.employees.missing}
                </Link>
              ) : (
                <span className="font-semibold">0</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
            <h2 className="mb-4 font-semibold">Cycles by Status</h2>
            <div className="flex flex-col gap-2">
              {STATUS_ORDER.map((s) => (
                <div key={s} className="flex items-center justify-between">
                  <StatusBadge status={s} />
                  <span className="font-semibold">{data.cycles.by_status[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Recent cycles */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="font-semibold">Recent Cycles</h2>
          <Link href="/enterprise/payroll" className="text-sm text-[var(--color-primary)]">
            View all →
          </Link>
        </div>
        {data.recent_cycles.length === 0 ? (
          <p className="p-8 text-center text-[var(--color-muted)]">No cycles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-6 py-3">Cycle</th>
                  <th className="px-6 py-3">Period</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Headcount</th>
                  <th className="px-6 py-3 text-right">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_cycles.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-hover)]/40">
                    <td className="px-6 py-3 font-medium">
                      <Link href={`/enterprise/payroll/${c.id}`} className="hover:text-[var(--color-primary)]">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-[var(--color-muted)]">
                      {c.period_start} → {c.period_end}
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-3 text-right">{c.headcount || "—"}</td>
                    <td className="px-6 py-3 text-right font-semibold">{inr(c.net, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "text-[var(--color-text)]",
  href,
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: string;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition-colors hover:border-[var(--color-primary)]/50">
      <span className="material-symbols-outlined mb-3 text-[var(--color-muted)]">{icon}</span>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-[var(--color-muted)]">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Mini({ label, value, tone = "text-[var(--color-text)]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function Coverage({ configured, total }: { configured: number; total: number }) {
  const pct = total > 0 ? Math.round((configured / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-semibold">{pct}%</span>
        <span className="text-[var(--color-muted)]">{configured}/{total}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
