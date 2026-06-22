"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  meApi,
  type LeaveBalance,
  type LeaveRequest,
  type MyPayslip,
  type Timesheet,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

const money = (n: number | string, currency = "INR") =>
  Number(n).toLocaleString("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });

const QUICK_LINKS = [
  { label: "Mark Attendance", icon: "schedule", path: "/employee/timesheets", hint: "Fill your timesheet" },
  { label: "Apply for Leave", icon: "event_available", path: "/employee/leave", hint: "Request & track" },
  { label: "View Payslips", icon: "receipt_long", path: "/employee/payslips", hint: "Download & review" },
];

// Per-card accent tints (chip bg + icon/value colour).
const TONE: Record<string, { chip: string; icon: string }> = {
  emerald: { chip: "bg-emerald-500/15", icon: "text-emerald-500" },
  amber: { chip: "bg-amber-500/15", icon: "text-amber-500" },
  violet: { chip: "bg-violet-500/15", icon: "text-violet-500" },
  sky: { chip: "bg-sky-500/15", icon: "text-sky-500" },
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [payslips, setPayslips] = useState<MyPayslip[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      meApi.leaveBalances(),
      meApi.leaveRequests(),
      meApi.payslips(),
      meApi.timesheets(),
    ])
      .then(([b, r, p, t]) => {
        setBalances(b);
        setRequests(r);
        setPayslips(p);
        setTimesheets(t);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = (user?.full_name || user?.email || "").split(" ")[0] || "there";
  const leaveAvailable = balances
    .filter((b) => b.is_paid !== false)
    .reduce((sum, b) => sum + Number(b.balance), 0);
  const pending = requests.filter((r) => r.status === "PENDING").length;
  const latestPayslip = payslips[0] ?? null;
  const latestTimesheet = timesheets[0] ?? null;

  const stats = [
    { tone: "emerald", label: "Leave available", value: `${leaveAvailable}`, sub: "paid days", icon: "event_available" },
    { tone: "amber", label: "Pending requests", value: `${pending}`, sub: "awaiting approval", icon: "hourglass_top" },
    {
      tone: "violet",
      label: "Latest net pay",
      value: latestPayslip ? money(latestPayslip.net_pay, latestPayslip.currency) : "—",
      sub: latestPayslip?.cycle_name ?? "no payslips yet",
      icon: "payments",
    },
    {
      tone: "sky",
      label: "Current timesheet",
      value: latestTimesheet?.status ?? "—",
      sub: latestTimesheet ? `${latestTimesheet.period_start} → ${latestTimesheet.period_end}` : "none yet",
      icon: "schedule",
    },
  ];

  if (loading) return <p className="text-[var(--color-muted)]">Loading…</p>;

  return (
    <div className="animate-fade-in mx-auto max-w-6xl">
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-primary)] to-violet-500 p-7 text-white shadow-lg">
        <div className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 right-20 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">My Workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Welcome back, {firstName} 👋</h1>
          <p className="mt-1 text-sm text-white/80">Here's a snapshot of your records.</p>
        </div>
      </div>

      {error && <Banner>{error}</Banner>}

      {/* Stat cards */}
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const tone = TONE[s.tone];
          return (
            <div
              key={s.label}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition-shadow hover:shadow-md"
            >
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone.chip}`}>
                <span className={`material-symbols-outlined ${tone.icon}`}>{s.icon}</span>
              </div>
              <div className="truncate text-2xl font-bold">{s.value}</div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="truncate text-xs text-[var(--color-dim)]">{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Quick actions
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.path}
            href={l.path}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-all hover:border-[var(--color-primary)] hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
              <span className="material-symbols-outlined">{l.icon}</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold">{l.label}</div>
              <div className="truncate text-xs text-[var(--color-muted)]">{l.hint}</div>
            </div>
            <span className="material-symbols-outlined ml-auto text-[var(--color-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">
              chevron_right
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Leave balances */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Leave balances
            </h2>
            <Link href="/employee/leave" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            {balances.length === 0 ? (
              <p className="p-5 text-center text-sm text-[var(--color-muted)]">No leave balances yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {balances.map((b) => {
                    const left = Number(b.balance);
                    const total = Number(b.accrued) || 1;
                    const pct = Math.max(0, Math.min(100, (left / total) * 100));
                    return (
                      <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-4 py-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="font-medium">{b.leave_type_name || b.leave_type_code}</span>
                            <span className="text-xs text-[var(--color-muted)]">
                              <span className="font-semibold text-[var(--color-text)]">{left}</span> left
                              {" · "}
                              {Number(b.used)} used
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-hover)]">
                            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Recent leave requests */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Recent leave requests
            </h2>
            <Link href="/employee/leave" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
            {requests.length === 0 ? (
              <p className="p-5 text-center text-sm text-[var(--color-muted)]">No leave requests yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {requests.slice(0, 5).map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-3 font-medium">{r.leave_type_name || r.leave_type_code}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {r.start_date}
                        {r.start_date !== r.end_date ? ` → ${r.end_date}` : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
