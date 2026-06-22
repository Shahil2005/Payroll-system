"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  calendarApi,
  payrollApi,
  timesheetApi,
  type Holiday,
  type PayrollCycle,
  type Timesheet,
  type WorkCalendarConfig,
} from "@/utils/api";
import { Banner, StatusBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function TimesheetsPage() {
  const { can } = useAuth();
  const { confirm } = useDialog();
  const canEdit = can("payroll:configure");
  const canApprove = can("payroll:approve");

  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [cycleId, setCycleId] = useState<string>("");
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Work-calendar config (lives with timesheets — drives working-day derivation).
  const [config, setConfig] = useState<WorkCalendarConfig | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holForm, setHolForm] = useState({ holiday_date: "", name: "" });

  const cycle = cycles.find((c) => c.id === cycleId) || null;
  const cycleEditable = cycle?.status === "DRAFT" || cycle?.status === "PROCESSING";

  async function loadCycles() {
    setLoading(true);
    try {
      const cs = await payrollApi.listCycles();
      setCycles(cs);
      if (cs.length && !cycleId) setCycleId(cs[0].id);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendar() {
    try {
      const [cfg, hols] = await Promise.all([
        calendarApi.getConfig(),
        calendarApi.listHolidays(),
      ]);
      setConfig(cfg);
      setHolidays(hols);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadRows(id: string) {
    if (!id) {
      setRows([]);
      return;
    }
    try {
      setRows(await timesheetApi.listForCycle(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    loadCycles();
    loadCalendar();
  }, []);

  useEffect(() => {
    loadRows(cycleId);
  }, [cycleId]);

  async function generate() {
    if (!cycleId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await timesheetApi.generate(cycleId);
      const parts = [`${res.created} created`, `${res.existing} already existed`];
      if (res.skipped.length) parts.push(`${res.skipped.length} skipped (no salary structure)`);
      setNotice(parts.join(" · "));
      await loadRows(cycleId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadRows(cycleId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCalendar() {
    if (!config) return;
    const next = !config.use_calendar_working_days;
    try {
      setConfig(await calendarApi.updateConfig({ use_calendar_working_days: next }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleMakerChecker() {
    if (!config) return;
    try {
      setConfig(
        await calendarApi.updateConfig({ enforce_maker_checker: !config.enforce_maker_checker }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleWeeklyOff(day: string) {
    if (!config) return;
    const set = new Set(config.weekly_offs);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    try {
      setConfig(await calendarApi.updateConfig({ weekly_offs: [...set] }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addHoliday() {
    if (!holForm.holiday_date || !holForm.name.trim()) return;
    try {
      await calendarApi.createHoliday(holForm.holiday_date, holForm.name.trim());
      setHolForm({ holiday_date: "", name: "" });
      setHolidays(await calendarApi.listHolidays());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeHoliday(h: Holiday) {
    if (!(await confirm({ title: "Remove holiday", message: `Delete "${h.name}"?` }))) return;
    try {
      await calendarApi.deleteHoliday(h.id);
      setHolidays(await calendarApi.listHolidays());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const num = (v: number | string) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Capture attendance per cycle. Approved timesheets drive loss-of-pay (and hours for
            hourly staff) on the next payroll run.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Banner>{error}</Banner>
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
          {notice}
        </div>
      )}

      {/* Cycle selector + generate */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Payroll cycle</span>
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className="min-w-[16rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            {cycles.length === 0 && <option value="">No cycles yet</option>}
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <button
            onClick={generate}
            disabled={!cycleId || busy || !cycleEditable}
            title={!cycleEditable ? "Cycle must be DRAFT or PROCESSING" : ""}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            Generate timesheets
          </button>
        )}
      </div>

      {/* Timesheet rows */}
      {loading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : !cycleId ? (
        <p className="text-sm text-[var(--color-muted)]">Create a payroll cycle first.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          No timesheets for this cycle yet. {canEdit && "Use “Generate timesheets” above."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Worked</th>
                <th className="px-4 py-3 text-right">LOP</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/enterprise/timesheets/${t.id}`} className="font-medium text-[var(--color-primary)] hover:underline">
                      {t.employee_name || t.employee_id.slice(0, 8)}
                    </Link>
                    {t.employee_code && (
                      <span className="ml-2 text-xs text-[var(--color-dim)]">{t.employee_code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{t.mode}</td>
                  <td className="px-4 py-3 text-right">{num(t.worked_days)}</td>
                  <td className="px-4 py-3 text-right">{num(t.lop_days)}</td>
                  <td className="px-4 py-3 text-right">{t.mode === "HOURLY" ? num(t.total_hours) : "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canApprove && t.status === "SUBMITTED" && (
                        <>
                          <button
                            onClick={() => act(t.id, () => timesheetApi.approve(t.id))}
                            disabled={busy}
                            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => act(t.id, () => timesheetApi.reject(t.id))}
                            disabled={busy}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {canApprove && t.status === "APPROVED" && (
                        <button
                          onClick={() => act(t.id, () => timesheetApi.reopen(t.id))}
                          disabled={busy}
                          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                      <Link
                        href={`/enterprise/timesheets/${t.id}`}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Work calendar config */}
      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="mb-1 text-lg font-bold">Work calendar</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Weekly-offs and holidays are excluded when deriving the working days a payroll run
          pro-rates against.
        </p>

        {config && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={config.use_calendar_working_days}
                onChange={toggleCalendar}
                disabled={!canEdit}
                className="h-4 w-4"
              />
              <span>
                Derive working days from the calendar
                <span className="ml-2 text-xs text-[var(--color-dim)]">
                  (off = fixed 30-day basis)
                </span>
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={config.enforce_maker_checker}
                onChange={toggleMakerChecker}
                disabled={!canEdit}
                className="h-4 w-4"
              />
              <span>
                Enforce segregation of duties
                <span className="ml-2 text-xs text-[var(--color-dim)]">
                  (the user who submits a timesheet/leave can’t approve it)
                </span>
              </span>
            </label>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Weekly offs
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = config.weekly_offs.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleWeeklyOff(d)}
                      disabled={!canEdit}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "bg-[var(--color-primary)] text-white"
                          : "border border-[var(--color-border)] text-[var(--color-muted)]"
                      } disabled:opacity-50`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Holidays
              </div>
              {holidays.length === 0 ? (
                <p className="text-sm text-[var(--color-dim)]">No holidays configured.</p>
              ) : (
                <ul className="mb-3 flex flex-col gap-1">
                  {holidays.map((h) => (
                    <li key={h.id} className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{h.holiday_date}</span>
                        <span className="ml-2 text-[var(--color-muted)]">{h.name}</span>
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => removeHoliday(h)}
                          className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    type="date"
                    value={holForm.holiday_date}
                    onChange={(e) => setHolForm({ ...holForm, holiday_date: e.target.value })}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Holiday name"
                    value={holForm.name}
                    onChange={(e) => setHolForm({ ...holForm, name: e.target.value })}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  />
                  <button
                    onClick={addHoliday}
                    className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                  >
                    Add holiday
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
