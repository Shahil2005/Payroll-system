"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  meApi,
  DAY_STATUS_OPTIONS,
  type DayStatus,
  type TimesheetDetail,
  type TimesheetEntryEdit,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  DAY_STATUS_OPTIONS.map((o) => [o.value, o.label])
);
// Statuses an employee may self-mark (no leave / no self-LOP — enforced server-side too).
const SELF_MARK: { value: DayStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "WFH", label: "Work From Home" },
];
const NON_WORKING = ["HOLIDAY", "WEEKLY_OFF"];
const LEAVE_LOCKED = ["PAID_LEAVE", "UNPAID_LEAVE", "HALF_DAY", "HALF_DAY_PAID"];
// UTC date (matches the server's utcnow().date() future-date guard).
const TODAY = new Date().toISOString().slice(0, 10);

export default function MyTimesheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [ts, setTs] = useState<TimesheetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, TimesheetEntryEdit>>({});

  async function load() {
    try {
      setTs(await meApi.timesheet(id));
      setEdits({});
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <Banner>{error}</Banner>;
  if (!ts) return <p className="text-[var(--color-muted)]">Loading…</p>;

  const isHourly = ts.mode === "HOURLY";
  const editable = ts.status === "DRAFT" || ts.status === "REJECTED";
  const dirty = Object.keys(edits).length > 0;

  const canMark = (e: TimesheetDetail["entries"][number]) =>
    editable &&
    !NON_WORKING.includes(e.day_status) &&
    !LEAVE_LOCKED.includes(e.day_status) &&
    e.entry_date <= TODAY;

  const statusFor = (date: string, server: DayStatus): DayStatus =>
    (edits[date]?.day_status as DayStatus) ?? server;
  const hoursFor = (date: string, server: number | string | null): string => {
    const e = edits[date];
    if (e && e.hours !== undefined) return e.hours === null ? "" : String(e.hours);
    return server === null ? "" : String(server);
  };

  function setStatus(date: string, value: DayStatus) {
    setEdits((p) => ({ ...p, [date]: { ...p[date], entry_date: date, day_status: value } }));
  }
  function setHours(date: string, value: string) {
    const hours = value === "" ? null : Number(value);
    setEdits((p) => ({ ...p, [date]: { ...p[date], entry_date: date, hours } }));
  }

  async function save() {
    setBusy(true);
    try {
      await meApi.markTimesheet(id, Object.values(edits));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const summary = isHourly
    ? [{ label: "Total hours", value: ts.total_hours }]
    : [
        { label: "Worked days", value: ts.worked_days },
        { label: "LOP days", value: ts.lop_days },
        { label: "Half days", value: ts.half_days },
      ];

  return (
    <div>
      <Link
        href="/employee/timesheets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        My Timesheets
      </Link>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {ts.period_start} → {ts.period_end}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {editable
              ? "Mark your working days Present or Work From Home. HR reviews and finalises."
              : `This timesheet is ${ts.status.toLowerCase()} and read-only.`}
          </p>
        </div>
        <StatusBadge status={ts.status} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{s.label}</div>
            <div className="text-xl font-bold">
              {Number(s.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {editable && (
        <div className="mb-4">
          <button
            onClick={save}
            disabled={!dirty || busy}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save attendance"}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">{isHourly ? "Hours" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {ts.entries.map((e) => {
              const dow = DOW[new Date(e.entry_date + "T00:00:00").getDay()];
              const markable = canMark(e);
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{e.entry_date}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{dow}</td>
                  <td className="px-4 py-2.5">
                    {isHourly ? (
                      markable ? (
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step="0.25"
                          value={hoursFor(e.entry_date, e.hours)}
                          onChange={(ev) => setHours(e.entry_date, ev.target.value)}
                          className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
                        />
                      ) : (
                        <span className="text-[var(--color-dim)]">
                          {e.hours === null ? "—" : Number(e.hours)}
                        </span>
                      )
                    ) : markable ? (
                      <select
                        value={statusFor(e.entry_date, e.day_status)}
                        onChange={(ev) => setStatus(e.entry_date, ev.target.value as DayStatus)}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
                      >
                        {SELF_MARK.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[var(--color-dim)]">
                        {STATUS_LABEL[e.day_status] ?? e.day_status}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
