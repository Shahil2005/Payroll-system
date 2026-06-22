"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  timesheetApi,
  DAY_STATUS_OPTIONS,
  type DayStatus,
  type TimesheetDetail,
  type TimesheetEntryEdit,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

// Statuses HR controls per working day. HOLIDAY / WEEKLY_OFF are set by the
// calendar at generate time and shown read-only.
const EDITABLE_DAY = DAY_STATUS_OPTIONS.filter(
  (o) => o.value !== "HOLIDAY" && o.value !== "WEEKLY_OFF"
);
const NON_WORKING: DayStatus[] = ["HOLIDAY", "WEEKLY_OFF"];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TimesheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const { confirm } = useDialog();
  const canEdit = can("payroll:configure");
  const canApprove = can("payroll:approve");

  const [ts, setTs] = useState<TimesheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local edits keyed by entry_date.
  const [edits, setEdits] = useState<Record<string, TimesheetEntryEdit>>({});

  async function load() {
    setLoading(true);
    try {
      setTs(await timesheetApi.get(id));
      setEdits({});
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const editable = ts?.status === "DRAFT" || ts?.status === "REJECTED";
  const isHourly = ts?.mode === "HOURLY";
  const dirty = Object.keys(edits).length > 0;

  // Effective value for a row = local edit if present, else the server value.
  const dayStatusFor = (date: string, server: DayStatus): DayStatus =>
    (edits[date]?.day_status as DayStatus) ?? server;
  const hoursFor = (date: string, server: number | string | null): string => {
    const e = edits[date];
    if (e && e.hours !== undefined) return e.hours === null ? "" : String(e.hours);
    return server === null ? "" : String(server);
  };

  function setDayStatus(date: string, value: DayStatus) {
    setEdits((prev) => ({ ...prev, [date]: { ...prev[date], entry_date: date, day_status: value } }));
  }
  function setHours(date: string, value: string) {
    const hours = value === "" ? null : Number(value);
    setEdits((prev) => ({ ...prev, [date]: { ...prev[date], entry_date: date, hours } }));
  }

  async function save() {
    if (!ts || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await timesheetApi.updateEntries(ts.id, Object.values(edits));
      setTs(updated);
      setEdits({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !(await confirm({ message: confirmMsg }))) return;
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

  const summary = useMemo(() => {
    if (!ts) return null;
    return [
      { label: "Worked days", value: ts.worked_days },
      { label: "LOP days", value: ts.lop_days },
      { label: "Half days", value: ts.half_days },
      ...(isHourly ? [{ label: "Total hours", value: ts.total_hours }] : []),
    ];
  }, [ts, isHourly]);

  if (loading) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>;
  if (!ts)
    return (
      <div>
        <Banner>{error || "Timesheet not found."}</Banner>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/enterprise/timesheets" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Timesheets
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ts.employee_name || ts.employee_id.slice(0, 8)}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {ts.period_start} → {ts.period_end} · {ts.mode}
          </p>
          {(ts.submitted_by_name || ts.approved_by_name) && (
            <p className="mt-1 text-xs text-[var(--color-dim)]">
              {ts.submitted_by_name && <>Submitted by {ts.submitted_by_name}</>}
              {ts.submitted_by_name && ts.approved_by_name && " · "}
              {ts.approved_by_name && <>Approved by {ts.approved_by_name}</>}
            </p>
          )}
        </div>
        <StatusBadge status={ts.status} />
      </div>

      {error && (
        <div className="mb-4">
          <Banner>{error}</Banner>
        </div>
      )}

      {/* Aggregate summary */}
      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{s.label}</div>
              <div className="text-xl font-bold">
                {Number(s.value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {canEdit && editable && (
          <button
            onClick={save}
            disabled={!dirty || busy}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            Save changes
          </button>
        )}
        {canEdit && editable && (
          <button
            onClick={() => act(() => timesheetApi.submit(ts.id), dirty ? "You have unsaved changes — submit without saving them?" : undefined)}
            disabled={busy || dirty}
            title={dirty ? "Save your changes first" : ""}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
          >
            Submit for approval
          </button>
        )}
        {canApprove && ts.status === "SUBMITTED" && (
          <>
            <button
              onClick={() => act(() => timesheetApi.approve(ts.id))}
              disabled={busy}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => act(() => timesheetApi.reject(ts.id))}
              disabled={busy}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {canApprove && ts.status === "APPROVED" && (
          <button
            onClick={() => act(() => timesheetApi.reopen(ts.id), "Reopen this approved timesheet for editing?")}
            disabled={busy}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] disabled:opacity-50"
          >
            Reopen
          </button>
        )}
      </div>

      {!editable && (
        <p className="mb-3 text-sm text-[var(--color-dim)]">
          This timesheet is {ts.status.toLowerCase()} and read-only.
          {ts.status === "APPROVED" && " Reopen it to make changes."}
        </p>
      )}

      {/* Daily grid */}
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
              const status = dayStatusFor(e.entry_date, e.day_status);
              const nonWorking = NON_WORKING.includes(e.day_status);
              const dow = DOW[new Date(e.entry_date + "T00:00:00").getDay()];
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{e.entry_date}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{dow}</td>
                  <td className="px-4 py-2.5">
                    {isHourly ? (
                      nonWorking ? (
                        <span className="text-[var(--color-dim)]">{e.day_status}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step="0.25"
                          value={hoursFor(e.entry_date, e.hours)}
                          onChange={(ev) => setHours(e.entry_date, ev.target.value)}
                          disabled={!canEdit || !editable}
                          className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 disabled:opacity-60"
                        />
                      )
                    ) : nonWorking ? (
                      <span className="text-[var(--color-dim)]">
                        {e.day_status === "WEEKLY_OFF" ? "Weekly Off" : "Holiday"}
                      </span>
                    ) : (
                      <select
                        value={status}
                        onChange={(ev) => setDayStatus(e.entry_date, ev.target.value as DayStatus)}
                        disabled={!canEdit || !editable}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 disabled:opacity-60"
                      >
                        {EDITABLE_DAY.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
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
