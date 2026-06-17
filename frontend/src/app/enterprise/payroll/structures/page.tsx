"use client";

import { useEffect, useMemo, useState } from "react";
import {
  payrollApi,
  estimateSalary,
  inr,
  type Employee,
  type MoneyLine,
  type ResolvedLine,
  type SalaryStructure,
  type StructurePreviewOut,
} from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

interface LineDraft {
  code: string;
  label: string;
  type: "fixed" | "percent" | "balance";
  amount: string;
  percent: string;
  percent_of: string;
}

const emptyLine = (): LineDraft => ({
  code: "",
  label: "",
  type: "fixed",
  amount: "",
  percent: "",
  percent_of: "",
});

function toMoneyLines(rows: LineDraft[]): MoneyLine[] {
  return rows
    .filter((r) => r.code.trim())
    .map((r) => {
      const base = { code: r.code.trim(), label: r.label.trim() || r.code.trim() };
      if (r.type === "balance") return { ...base, type: "balance" as const };
      if (r.type === "fixed") return { ...base, type: "fixed" as const, amount: Number(r.amount) || 0 };
      return {
        ...base,
        type: "percent" as const,
        percent: Number(r.percent) || 0,
        percent_of: r.percent_of || null,
      };
    });
}

function fromMoneyLines(lines: MoneyLine[]): LineDraft[] {
  return (lines || []).map((l) => ({
    code: l.code,
    label: l.label,
    type: l.type,
    amount: l.amount != null ? String(l.amount) : "",
    percent: l.percent != null ? String(l.percent) : "",
    percent_of: l.percent_of || "",
  }));
}

export default function StructuresPage() {
  const { can } = useAuth();
  const { confirm, alert } = useDialog();
  const canEdit = can("payroll:configure");
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [ctc, setCtc] = useState("1200000");
  const [currency, setCurrency] = useState("INR");
  const [payFrequency, setPayFrequency] = useState<"MONTHLY" | "WEEKLY">("MONTHLY");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [earnings, setEarnings] = useState<LineDraft[]>([]);
  const [deductions, setDeductions] = useState<LineDraft[]>([]);
  const [lopDays, setLopDays] = useState("0");
  // Statutory toggles (Phase 1)
  const [pfEnabled, setPfEnabled] = useState(false);
  const [pfCap, setPfCap] = useState(true);
  const [esiEnabled, setEsiEnabled] = useState(false);
  const [ptEnabled, setPtEnabled] = useState(false);
  const [tdsEnabled, setTdsEnabled] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([payrollApi.listStructures(), payrollApi.listEmployees()]);
      setStructures(s);
      setEmployees(e);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const empOf = (eid: string) => employees.find((x) => x.id === eid);
  const empName = (eid: string) => {
    const e = empOf(eid);
    return e ? `${e.first_name} ${e.last_name}`.trim() : `Employee ${eid.slice(0, 8)}`;
  };

  // Instant local estimate (manual lines only) — shown immediately while the
  // authoritative server preview (which also includes statutory + TDS) loads.
  const estimate = useMemo(
    () =>
      estimateSalary(
        toMoneyLines(earnings),
        toMoneyLines(deductions),
        Number(lopDays) || 0,
        undefined,
        Number(ctc) || 0,
        payFrequency
      ),
    [earnings, deductions, lopDays, ctc, payFrequency]
  );
  const earningCodes = earnings.map((e) => e.code).filter(Boolean);

  // Authoritative live preview from the backend — same engine a payroll run
  // uses, so PF/ESI/PT/TDS deductions update in real time as toggles change.
  const [preview, setPreview] = useState<StructurePreviewOut | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewing(true);
    const handle = setTimeout(() => {
      payrollApi
        .previewStructure({
          employee_id: employeeId || null,
          ctc: Number(ctc) || 0,
          pay_frequency: payFrequency,
          components: toMoneyLines(earnings),
          default_deductions: toMoneyLines(deductions),
          lop_days: Number(lopDays) || 0,
          pf_enabled: pfEnabled,
          pf_cap_at_ceiling: pfCap,
          esi_enabled: esiEnabled,
          pt_enabled: ptEnabled,
          tds_enabled: tdsEnabled,
        })
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, employeeId, ctc, payFrequency, earnings, deductions, lopDays, pfEnabled, pfCap, esiEnabled, ptEnabled, tdsEnabled]);

  // Prefer the server figures once available; fall back to the local estimate.
  const gross = preview ? Number(preview.gross_earnings) : estimate.gross;
  const totalDeductions = preview ? Number(preview.total_deductions) : estimate.totalDeductions;
  const net = preview ? Number(preview.net_pay) : estimate.net;
  const deductionLines: ResolvedLine[] = preview
    ? (preview.deductions ?? [])
    : estimate.deductions;

  function openCreate() {
    setEditingId(null);
    setEmployeeId(employees[0]?.id ?? "");
    setCtc("1200000");
    setCurrency("INR");
    setPayFrequency("MONTHLY");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setEarnings([
      { ...emptyLine(), code: "BASIC", label: "Basic", type: "fixed", amount: "40000" },
      { ...emptyLine(), code: "HRA", label: "HRA", type: "percent", percent: "40", percent_of: "BASIC" },
    ]);
    setDeductions([]);
    setLopDays("0");
    setPfEnabled(false);
    setPfCap(true);
    setEsiEnabled(false);
    setPtEnabled(false);
    setTdsEnabled(false);
    setFormErr(null);
    setOpen(true);
  }

  function openEdit(s: SalaryStructure) {
    setEditingId(s.id);
    setEmployeeId(s.employee_id);
    setCtc(String(s.ctc));
    setCurrency(s.currency);
    setPayFrequency(s.pay_frequency);
    setEffectiveFrom(s.effective_from);
    setEarnings(fromMoneyLines(s.components));
    setDeductions(fromMoneyLines(s.default_deductions));
    setLopDays(String(s.lop_days ?? 0));
    setPfEnabled(s.pf_enabled ?? false);
    setPfCap(s.pf_cap_at_ceiling ?? true);
    setEsiEnabled(s.esi_enabled ?? false);
    setPtEnabled(s.pt_enabled ?? false);
    setTdsEnabled(s.tds_enabled ?? false);
    setFormErr(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!employeeId) {
      setFormErr("Select an employee.");
      return;
    }
    const body = {
      ctc: Number(ctc),
      currency,
      pay_frequency: payFrequency,
      effective_from: effectiveFrom,
      components: toMoneyLines(earnings),
      default_deductions: toMoneyLines(deductions),
      lop_days: Number(lopDays) || 0,
      is_active: true,
      pf_enabled: pfEnabled,
      pf_cap_at_ceiling: pfCap,
      esi_enabled: esiEnabled,
      pt_enabled: ptEnabled,
      tds_enabled: tdsEnabled,
    };
    setSaving(true);
    try {
      if (editingId) {
        await payrollApi.updateStructure(editingId, body);
      } else {
        await payrollApi.createStructure({ ...body, employee_id: employeeId });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete salary structure",
      message: "Delete this salary structure? This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await payrollApi.deleteStructure(id);
      await load();
    } catch (err) {
      await alert({ message: (err as Error).message, tone: "danger" });
    }
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <span className="material-symbols-outlined">tune</span>
          </span>
          <div>
            <h1 className="text-3xl font-bold">Salary Structures</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Define each employee&apos;s earnings, deductions &amp; statutory setup.
            </p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Structure
          </button>
        )}
      </header>

      {error && <Banner>{error}</Banner>}

      {/* Summary strip */}
      {!loading && structures.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon="groups" label="Structures" value={String(structures.length)} />
          <SummaryCard
            icon="savings"
            label="EPF enabled"
            value={String(structures.filter((s) => s.pf_enabled).length)}
          />
          <SummaryCard
            icon="health_and_safety"
            label="ESI enabled"
            value={String(structures.filter((s) => s.esi_enabled).length)}
          />
          <SummaryCard
            icon="account_balance"
            label="TDS enabled"
            value={String(structures.filter((s) => s.tds_enabled).length)}
          />
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        {loading ? (
          <p className="p-8 text-center text-[var(--color-muted)]">Loading…</p>
        ) : structures.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-hover)] text-[var(--color-dim)]">
              <span className="material-symbols-outlined text-3xl">tune</span>
            </span>
            <p className="font-medium">No salary structures yet</p>
            <p className="max-w-sm text-sm text-[var(--color-muted)]">
              Create a structure to define an employee&apos;s earnings and statutory deductions.
            </p>
            {canEdit && (
              <button onClick={openCreate} className="mt-1 flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                <span className="material-symbols-outlined text-[20px]">add</span>
                Add your first structure
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
                  <th className="px-6 py-3 font-semibold">Employee</th>
                  <th className="px-6 py-3 text-right font-semibold">CTC (annual)</th>
                  <th className="px-6 py-3 font-semibold">Statutory</th>
                  <th className="px-6 py-3 font-semibold">Effective</th>
                  {canEdit && <th className="px-6 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => {
                  const e = empOf(s.employee_id);
                  const initials = e
                    ? `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`.toUpperCase()
                    : "—";
                  return (
                    <tr key={s.id} className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-hover)]/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-bold text-[var(--color-primary)]">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium">{empName(s.employee_id)}</div>
                            {e?.email && (
                              <div className="truncate text-xs text-[var(--color-muted)]">{e.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-semibold">{inr(s.ctc, s.currency)}</div>
                        <div className="text-xs text-[var(--color-muted)]">{s.pay_frequency.toLowerCase()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {s.pf_enabled && <StatChip>EPF</StatChip>}
                          {s.esi_enabled && <StatChip>ESI</StatChip>}
                          {s.pt_enabled && <StatChip>PT</StatChip>}
                          {s.tds_enabled && <StatChip>TDS</StatChip>}
                          {!s.pf_enabled && !s.esi_enabled && !s.pt_enabled && !s.tds_enabled && (
                            <span className="text-xs text-[var(--color-dim)]">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[var(--color-muted)]">{s.effective_from}</td>
                      {canEdit && (
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(s)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]">
                              Edit
                            </button>
                            <button onClick={() => remove(s.id)} className="rounded-md px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal
          title={editingId ? "Edit Salary Structure" : "New Salary Structure"}
          onClose={() => setOpen(false)}
          width="max-w-6xl"
        >
          <form onSubmit={save} className="flex flex-col gap-6">
            {formErr && <Banner>{formErr}</Banner>}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              {/* Left column — the editable structure */}
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Employee</span>
                    <select
                      className="input"
                      value={employeeId}
                      disabled={!!editingId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                    >
                      {employees.length === 0 && <option value="">No employees — add one first</option>}
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.first_name} {e.last_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Annual CTC</span>
                    <input type="number" className="input" value={ctc} onChange={(e) => setCtc(e.target.value)} required />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Currency</span>
                    <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Pay Frequency</span>
                    <select className="input" value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as "MONTHLY" | "WEEKLY")}>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="WEEKLY">WEEKLY</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Effective From</span>
                    <input type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
                  </label>
                </div>

                <LineSection
                  title="Earnings"
                  rows={earnings}
                  setRows={setEarnings}
                  earningCodes={earningCodes}
                />
                <LineSection
                  title="Deductions"
                  rows={deductions}
                  setRows={setDeductions}
                  earningCodes={earningCodes}
                  footer={
                    <label className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
                      <span className="lbl">Loss of Pay (LOP days)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="input w-40"
                        value={lopDays}
                        onChange={(e) => setLopDays(e.target.value)}
                      />
                      <span className="text-xs text-[var(--color-muted)]">
                        Unpaid days for this employee. Earnings are pro-rated over {/* working-days basis */}
                        30 days when payroll runs.
                      </span>
                    </label>
                  }
                />

                {/* Statutory compliance (Phase 1: PF / ESI / PT / TDS) */}
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--color-primary)]">verified_user</span>
                <span className="font-semibold">Statutory Compliance</span>
                <span className="ml-auto text-xs text-[var(--color-muted)]">auto-computed when on</span>
              </div>
              <div className="flex flex-col gap-2">
                <ToggleRow
                  icon="savings"
                  title="Provident Fund (EPF)"
                  desc="12% employee + employer contribution."
                  checked={pfEnabled}
                  onChange={setPfEnabled}
                >
                  {pfEnabled && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      <input type="checkbox" checked={pfCap} onChange={(e) => setPfCap(e.target.checked)} />
                      <span>Cap PF wage at the ₹15,000 statutory ceiling</span>
                    </label>
                  )}
                </ToggleRow>
                <ToggleRow
                  icon="health_and_safety"
                  title="ESI"
                  desc="0.75% employee + 3.25% employer (gross ≤ ₹21,000)."
                  checked={esiEnabled}
                  onChange={setEsiEnabled}
                />
                <ToggleRow
                  icon="account_balance_wallet"
                  title="Professional Tax"
                  desc="Computed by the employee's state slab."
                  checked={ptEnabled}
                  onChange={setPtEnabled}
                />
                <ToggleRow
                  icon="account_balance"
                  title="Income Tax (TDS)"
                  desc="Estimated from the employee's IT declaration."
                  checked={tdsEnabled}
                  onChange={setTdsEnabled}
                >
                  {tdsEnabled && (
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      Set the employee&apos;s regime &amp; declarations under Taxes &amp; Forms. TDS is an
                      estimate, not filing-grade.
                    </p>
                  )}
                </ToggleRow>
              </div>
                  <p className="mt-3 text-xs text-[var(--color-muted)]">
                    Statutory amounts are calculated automatically and shown as locked lines on the
                    payslip — don&apos;t also add them as manual deduction lines above. The live
                    estimate alongside already includes them.
                  </p>
                </div>
              </div>

              {/* Right column — live estimate (server-computed; sticky) */}
              <div className="lg:sticky lg:top-0 lg:self-start">
                <div className="overflow-hidden rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-bg)]">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="material-symbols-outlined text-[18px] text-[var(--color-primary)]">calculate</span>
                  Estimated Monthly Salary
                  {previewing && (
                    <span className="text-xs font-normal text-[var(--color-muted)]">updating…</span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-muted)]">
                  {Number(lopDays) > 0 ? `after ${Number(lopDays)} LOP day(s) · 30-day basis` : "full month · no LOP"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-4">
                <Stat label="Gross" value={inr(gross, currency)} />
                <Stat label="Deductions" value={`- ${inr(totalDeductions, currency)}`} tone="text-[var(--color-danger)]" />
                <Stat label="Net Pay" value={inr(net, currency)} tone="text-[var(--color-accent)]" big />
              </div>
              {deductionLines.length > 0 && (
                <div className="border-t border-[var(--color-border)] px-4 py-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Deduction breakdown
                  </div>
                  <div className="flex flex-col gap-1">
                    {deductionLines.map((l) => (
                      <div key={l.code} className="flex justify-between text-sm">
                        <span className="text-[var(--color-muted)]">{l.label}</span>
                        <span className="font-medium text-[var(--color-danger)]">
                          - {inr(l.amount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                  {!preview && !previewing && (
                    <p className="px-4 pb-3 text-xs text-[var(--color-muted)]">
                      Showing a local estimate (manual lines only) — statutory figures appear once
                      the live preview loads.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-8">
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{ width: "auto" }} className="btn-primary px-8">
                {saving ? "Saving…" : editingId ? "Update Structure" : "Save Structure"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-[var(--color-text)]", big = false }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`font-bold ${tone} ${big ? "text-xl" : "text-base"}`}>{value}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-xs text-[var(--color-muted)]">{label}</div>
      </div>
    </div>
  );
}

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
      {children}
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-hover)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        checked
          ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5"
          : "border-[var(--color-border)] bg-[var(--color-card)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            checked
              ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
              : "bg-[var(--color-hover)] text-[var(--color-muted)]"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-[var(--color-muted)]">{desc}</div>
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>
      {children && <div className="pl-11">{children}</div>}
    </div>
  );
}

function LineSection({
  title,
  rows,
  setRows,
  earningCodes,
  footer,
}: {
  title: string;
  rows: LineDraft[];
  setRows: (r: LineDraft[]) => void;
  earningCodes: string[];
  footer?: React.ReactNode;
}) {
  const update = (i: number, patch: Partial<LineDraft>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => setRows([...rows, emptyLine()])}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]"
        >
          + Add line
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-[var(--color-muted)]">No lines.</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <input
              className="input col-span-2"
              placeholder="CODE"
              value={r.code}
              onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
            />
            <input
              className="input col-span-3"
              placeholder="Label"
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <select
              className="input col-span-2"
              value={r.type}
              onChange={(e) => update(i, { type: e.target.value as LineDraft["type"] })}
            >
              <option value="fixed">Fixed</option>
              <option value="percent">Percent</option>
              <option value="balance">Balance (CTC)</option>
            </select>
            {r.type === "fixed" ? (
              <input
                className="input col-span-4"
                type="number"
                placeholder="Amount"
                value={r.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
              />
            ) : r.type === "balance" ? (
              <span className="col-span-4 self-center text-xs text-[var(--color-muted)]">
                Absorbs the remaining CTC after the other earnings.
              </span>
            ) : (
              <>
                <input
                  className="input col-span-2"
                  type="number"
                  placeholder="%"
                  value={r.percent}
                  onChange={(e) => update(i, { percent: e.target.value })}
                />
                <select
                  className="input col-span-2"
                  value={r.percent_of}
                  onChange={(e) => update(i, { percent_of: e.target.value })}
                >
                  <option value="">of gross</option>
                  <option value="CTC">of CTC</option>
                  {earningCodes
                    .filter((c) => c && c !== r.code)
                    .map((c) => (
                      <option key={c} value={c}>
                        of {c}
                      </option>
                    ))}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              className="col-span-1 flex justify-center text-[var(--color-danger)]"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        ))}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
