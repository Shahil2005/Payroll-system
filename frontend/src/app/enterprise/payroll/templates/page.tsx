"use client";

import { useEffect, useMemo, useState } from "react";
import {
  payrollApi,
  inr,
  type Employee,
  type MoneyLine,
  type PayFrequency,
  type ResolvedLine,
  type SalaryTemplate,
  type StructurePreviewOut,
  type TemplateAssignment,
} from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

// ---------------------------------------------------------------------------
// A template is a reusable, CTC-driven salary package: its lines are *rules*
// (percent-of-CTC + a balance line), so applying it to an employee scales the
// amounts to that employee's CTC. This page manages templates and applies them.
// ---------------------------------------------------------------------------

interface LineDraft {
  code: string;
  label: string;
  type: "fixed" | "percent" | "balance";
  amount: string;
  percent: string;
  percent_of: string;
}

const emptyLine = (): LineDraft => ({ code: "", label: "", type: "fixed", amount: "", percent: "", percent_of: "" });

function toMoneyLines(rows: LineDraft[]): MoneyLine[] {
  return rows
    .filter((r) => r.code.trim())
    .map((r) => {
      const base = { code: r.code.trim(), label: r.label.trim() || r.code.trim() };
      if (r.type === "balance") return { ...base, type: "balance" as const };
      if (r.type === "fixed") return { ...base, type: "fixed" as const, amount: Number(r.amount) || 0 };
      return { ...base, type: "percent" as const, percent: Number(r.percent) || 0, percent_of: r.percent_of || null };
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

const SAMPLE_CTC_DEFAULT = "1200000";

export default function TemplatesPage() {
  const { can } = useAuth();
  const { confirm, alert } = useDialog();
  const canEdit = can("payroll:configure");

  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor modal state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("MONTHLY");
  const [earnings, setEarnings] = useState<LineDraft[]>([]);
  const [deductions, setDeductions] = useState<LineDraft[]>([]);
  const [pfEnabled, setPfEnabled] = useState(false);
  const [pfCap, setPfCap] = useState(true);
  const [esiEnabled, setEsiEnabled] = useState(false);
  const [ptEnabled, setPtEnabled] = useState(false);
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [sampleCtc, setSampleCtc] = useState(SAMPLE_CTC_DEFAULT);

  async function load() {
    setLoading(true);
    try {
      const [t, e] = await Promise.all([payrollApi.listTemplates(), payrollApi.listEmployees()]);
      setTemplates(t);
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

  const earningCodes = earnings.map((e) => e.code).filter(Boolean);

  // The sample CTC only moves the numbers when at least one earning line is
  // anchored to CTC — a "balance" line (absorbs the CTC remainder) or a
  // percent-of-CTC line. With only fixed / percent-of-other lines the gross is
  // independent of CTC, so editing it does nothing (by design).
  const ctcDriven = useMemo(
    () =>
      earnings.some(
        (e) => e.type === "balance" || (e.type === "percent" && e.percent_of === "CTC")
      ),
    [earnings]
  );

  // Live preview from the real engine, resolved at the sample CTC so the author
  // sees how the rules break down (incl. statutory) before applying.
  const [preview, setPreview] = useState<StructurePreviewOut | null>(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewing(true);
    const handle = setTimeout(() => {
      payrollApi
        .previewStructure({
          ctc: Number(sampleCtc) || 0,
          pay_frequency: payFrequency,
          components: toMoneyLines(earnings),
          default_deductions: toMoneyLines(deductions),
          lop_days: 0,
          pf_enabled: pfEnabled,
          pf_cap_at_ceiling: pfCap,
          esi_enabled: esiEnabled,
          pt_enabled: ptEnabled,
          tds_enabled: tdsEnabled,
        })
        .then((res) => !cancelled && setPreview(res))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setPreviewing(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, sampleCtc, payFrequency, earnings, deductions, pfEnabled, pfCap, esiEnabled, ptEnabled, tdsEnabled]);

  function openCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setCurrency("INR");
    setPayFrequency("MONTHLY");
    setEarnings([
      { ...emptyLine(), code: "BASIC", label: "Basic", type: "percent", percent: "40", percent_of: "CTC" },
      { ...emptyLine(), code: "HRA", label: "HRA", type: "percent", percent: "50", percent_of: "BASIC" },
      { ...emptyLine(), code: "SPECIAL", label: "Special Allowance", type: "balance" },
    ]);
    setDeductions([]);
    setPfEnabled(false);
    setPfCap(true);
    setEsiEnabled(false);
    setPtEnabled(false);
    setTdsEnabled(false);
    setSampleCtc(SAMPLE_CTC_DEFAULT);
    setFormErr(null);
    setOpen(true);
  }

  function openEdit(t: SalaryTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    setCurrency(t.currency);
    setPayFrequency(t.pay_frequency);
    setEarnings(fromMoneyLines(t.components));
    setDeductions(fromMoneyLines(t.default_deductions));
    setPfEnabled(t.pf_enabled);
    setPfCap(t.pf_cap_at_ceiling);
    setEsiEnabled(t.esi_enabled);
    setPtEnabled(t.pt_enabled);
    setTdsEnabled(t.tds_enabled);
    setSampleCtc(SAMPLE_CTC_DEFAULT);
    setFormErr(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!name.trim()) {
      setFormErr("Give the template a name.");
      return;
    }
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      currency,
      pay_frequency: payFrequency,
      components: toMoneyLines(earnings),
      default_deductions: toMoneyLines(deductions),
      pf_enabled: pfEnabled,
      pf_cap_at_ceiling: pfCap,
      esi_enabled: esiEnabled,
      pt_enabled: ptEnabled,
      tds_enabled: tdsEnabled,
    };
    setSaving(true);
    try {
      if (editingId) await payrollApi.updateTemplate(editingId, body);
      else await payrollApi.createTemplate(body);
      setOpen(false);
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: SalaryTemplate) {
    const ok = await confirm({
      title: "Delete template",
      message: `Delete "${t.name}"? Structures already created from it are unaffected.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await payrollApi.deleteTemplate(t.id);
      await load();
    } catch (err) {
      await alert({ message: (err as Error).message, tone: "danger" });
    }
  }

  // ---- Apply flow ----
  const [applyFor, setApplyFor] = useState<SalaryTemplate | null>(null);

  const gross = preview ? Number(preview.gross_earnings) : 0;
  const totalDeductions = preview ? Number(preview.total_deductions) : 0;
  const net = preview ? Number(preview.net_pay) : 0;
  const earningLines: ResolvedLine[] = preview?.earnings ?? [];
  const deductionLines: ResolvedLine[] = preview?.deductions ?? [];

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <span className="material-symbols-outlined">content_copy</span>
          </span>
          <div>
            <h1 className="text-3xl font-bold">Salary Templates</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Reusable, CTC-driven packages. Define the rules once, apply to many employees.
            </p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="flex shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
            <span className="material-symbols-outlined text-[20px]">add</span>
            New Template
          </button>
        )}
      </header>

      {error && <Banner>{error}</Banner>}

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        {loading ? (
          <p className="p-8 text-center text-[var(--color-muted)]">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-hover)] text-[var(--color-dim)]">
              <span className="material-symbols-outlined text-3xl">content_copy</span>
            </span>
            <p className="font-medium">No salary templates yet</p>
            <p className="max-w-sm text-sm text-[var(--color-muted)]">
              Create a template (e.g. &ldquo;Engineer L1&rdquo;) with percentage-of-CTC rules, then
              apply it to employees at their own CTC.
            </p>
            {canEdit && (
              <button onClick={openCreate} className="mt-1 flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                <span className="material-symbols-outlined text-[20px]">add</span>
                Create your first template
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
                  <th className="px-6 py-3 font-semibold">Template</th>
                  <th className="px-6 py-3 font-semibold">Earnings</th>
                  <th className="px-6 py-3 font-semibold">Statutory</th>
                  <th className="px-6 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-hover)]/30">
                    <td className="px-6 py-4">
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="text-xs text-[var(--color-muted)]">{t.description}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {t.components.map((c) => (
                          <StatChip key={c.code}>{c.code}</StatChip>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {t.pf_enabled && <StatChip>EPF</StatChip>}
                        {t.esi_enabled && <StatChip>ESI</StatChip>}
                        {t.pt_enabled && <StatChip>PT</StatChip>}
                        {t.tds_enabled && <StatChip>TDS</StatChip>}
                        {!t.pf_enabled && !t.esi_enabled && !t.pt_enabled && !t.tds_enabled && (
                          <span className="text-xs text-[var(--color-dim)]">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && (
                          <button onClick={() => setApplyFor(t)} className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                            Apply
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => openEdit(t)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]">
                            Edit
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => remove(t)} className="rounded-md px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal title={editingId ? "Edit Template" : "New Template"} onClose={() => setOpen(false)} width="max-w-6xl">
          <form onSubmit={save} className="flex flex-col gap-6">
            {formErr && <Banner>{formErr}</Banner>}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Template Name</span>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineer L1" required />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="lbl">Pay Frequency</span>
                    <select className="input" value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}>
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="WEEKLY">WEEKLY</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 sm:col-span-2">
                    <span className="lbl">Description (optional)</span>
                    <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Standard package for L1 engineers" />
                  </label>
                </div>

                <LineSection title="Earnings" rows={earnings} setRows={setEarnings} earningCodes={earningCodes} />
                <LineSection title="Deductions" rows={deductions} setRows={setDeductions} earningCodes={earningCodes} />

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[var(--color-primary)]">verified_user</span>
                    <span className="font-semibold">Statutory Compliance</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <ToggleRow icon="savings" title="Provident Fund (EPF)" desc="12% employee + employer." checked={pfEnabled} onChange={setPfEnabled}>
                      {pfEnabled && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                          <input type="checkbox" checked={pfCap} onChange={(e) => setPfCap(e.target.checked)} />
                          <span>Cap PF wage at the ₹15,000 ceiling</span>
                        </label>
                      )}
                    </ToggleRow>
                    <ToggleRow icon="health_and_safety" title="ESI" desc="When gross ≤ ₹21,000." checked={esiEnabled} onChange={setEsiEnabled} />
                    <ToggleRow icon="account_balance_wallet" title="Professional Tax" desc="By the employee's state slab." checked={ptEnabled} onChange={setPtEnabled} />
                    <ToggleRow icon="account_balance" title="Income Tax (TDS)" desc="Estimated from the IT declaration." checked={tdsEnabled} onChange={setTdsEnabled} />
                  </div>
                </div>
              </div>

              {/* Live preview at a sample CTC */}
              <div className="lg:sticky lg:top-0 lg:self-start">
                <div className="overflow-hidden rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-bg)]">
                  <div className="border-b border-[var(--color-border)] px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="material-symbols-outlined text-[18px] text-[var(--color-primary)]">calculate</span>
                      Preview at sample CTC
                      {previewing && <span className="text-xs font-normal text-[var(--color-muted)]">updating…</span>}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="lbl">Sample Annual CTC</span>
                      <input type="number" className="input" value={sampleCtc} onChange={(e) => setSampleCtc(e.target.value)} />
                      {!ctcDriven && (
                        <span className="text-xs text-[var(--color-warn)]">
                          No earning line is anchored to CTC, so changing this won&apos;t affect the
                          numbers. Add a <strong>Balance (CTC)</strong> line or a{" "}
                          <strong>Percent … of CTC</strong> line to make the package CTC-driven.
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 pb-3">
                    <Stat label="Gross" value={inr(gross, currency)} />
                    <Stat label="Deductions" value={`- ${inr(totalDeductions, currency)}`} tone="text-[var(--color-danger)]" />
                    <Stat label="Net" value={inr(net, currency)} tone="text-[var(--color-accent)]" big />
                  </div>
                  {earningLines.length > 0 && (
                    <div className="border-t border-[var(--color-border)] px-4 py-3">
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Earnings breakdown</div>
                      <div className="flex flex-col gap-1">
                        {earningLines.map((l) => (
                          <div key={l.code} className="flex justify-between text-sm">
                            <span className="text-[var(--color-muted)]">{l.label}</span>
                            <span className="font-medium">{inr(l.amount, currency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {deductionLines.length > 0 && (
                    <div className="border-t border-[var(--color-border)] px-4 py-3">
                      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Deduction breakdown</div>
                      <div className="flex flex-col gap-1">
                        {deductionLines.map((l) => (
                          <div key={l.code} className="flex justify-between text-sm">
                            <span className="text-[var(--color-muted)]">{l.label}</span>
                            <span className="font-medium text-[var(--color-danger)]">- {inr(l.amount, currency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-8">Cancel</button>
              <button type="submit" disabled={saving} style={{ width: "auto" }} className="btn-primary px-8">
                {saving ? "Saving…" : editingId ? "Update Template" : "Save Template"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {applyFor && (
        <ApplyModal
          template={applyFor}
          employees={employees}
          onClose={() => setApplyFor(null)}
          onApplied={async () => {
            setApplyFor(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apply-to-employees modal
// ---------------------------------------------------------------------------
function ApplyModal({
  template,
  employees,
  onClose,
  onApplied,
}: {
  template: SalaryTemplate;
  employees: Employee[];
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}) {
  const { alert } = useDialog();
  const today = new Date().toISOString().slice(0, 10);
  const [defaultCtc, setDefaultCtc] = useState("1200000");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [rows, setRows] = useState<Record<string, { checked: boolean; ctc: string }>>(
    () => Object.fromEntries(employees.map((e) => [e.id, { checked: false, ctc: "" }]))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(() => employees.filter((e) => rows[e.id]?.checked), [employees, rows]);

  function toggle(id: string) {
    setRows((r) => ({ ...r, [id]: { ...r[id], checked: !r[id].checked } }));
  }

  async function submit() {
    setErr(null);
    if (selected.length === 0) {
      setErr("Select at least one employee.");
      return;
    }
    const assignments: TemplateAssignment[] = selected.map((e) => ({
      employee_id: e.id,
      ctc: Number(rows[e.id].ctc || defaultCtc) || 0,
      effective_from: effectiveFrom,
    }));
    if (assignments.some((a) => a.ctc <= 0)) {
      setErr("Every selected employee needs a CTC greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const res = await payrollApi.applyTemplate(template.id, assignments, replaceExisting);
      await alert({
        title: "Template applied",
        message:
          `${res.created.length} structure(s) created.` +
          (res.skipped.length ? ` ${res.skipped.length} skipped (already configured).` : ""),
        tone: res.skipped.length ? "danger" : "default",
      });
      await onApplied();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Apply "${template.name}"`} onClose={onClose} width="max-w-3xl">
      <div className="flex flex-col gap-5">
        {err && <Banner>{err}</Banner>}
        <p className="text-sm text-[var(--color-muted)]">
          Each selected employee gets a salary structure generated from this template, scaled to
          their own CTC. Leave an employee&apos;s CTC blank to use the default.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Default Annual CTC</span>
            <input type="number" className="input" value={defaultCtc} onChange={(e) => setDefaultCtc(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Effective From</span>
            <input type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </label>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)] text-xs uppercase text-[var(--color-muted)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-2.5 w-10" />
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 text-right font-semibold">CTC (override)</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-[var(--color-muted)]">No employees.</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={rows[e.id]?.checked ?? false} onChange={() => toggle(e.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{e.first_name} {e.last_name}</div>
                    {e.email && <div className="text-xs text-[var(--color-muted)]">{e.email}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      className="input w-36 text-right"
                      placeholder={defaultCtc}
                      value={rows[e.id]?.ctc ?? ""}
                      onChange={(ev) => setRows((r) => ({ ...r, [e.id]: { ...r[e.id], ctc: ev.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          <span>Replace an existing active structure (otherwise that employee is skipped)</span>
        </label>

        <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
          <button type="button" onClick={onClose} className="btn-ghost px-8">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={{ width: "auto" }} className="btn-primary px-8">
            {busy ? "Applying…" : `Apply to ${selected.length || ""} employee${selected.length === 1 ? "" : "s"}`.trim()}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function Stat({ label, value, tone = "text-[var(--color-text)]", big = false }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`font-bold ${tone} ${big ? "text-xl" : "text-base"}`}>{value}</div>
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-hover)]"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
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
    <div className={`rounded-lg border p-3 transition-colors ${checked ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5" : "border-[var(--color-border)] bg-[var(--color-card)]"}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${checked ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-[var(--color-hover)] text-[var(--color-muted)]"}`}>
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
}: {
  title: string;
  rows: LineDraft[];
  setRows: (r: LineDraft[]) => void;
  earningCodes: string[];
}) {
  const update = (i: number, patch: Partial<LineDraft>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <button type="button" onClick={() => setRows([...rows, emptyLine()])} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]">
          + Add line
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-[var(--color-muted)]">No lines.</p>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <input className="input col-span-2" placeholder="CODE" value={r.code} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
            <input className="input col-span-3" placeholder="Label" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />
            <select className="input col-span-2" value={r.type} onChange={(e) => update(i, { type: e.target.value as LineDraft["type"] })}>
              <option value="fixed">Fixed</option>
              <option value="percent">Percent</option>
              <option value="balance">Balance (CTC)</option>
            </select>
            {r.type === "fixed" ? (
              <input className="input col-span-4" type="number" placeholder="Amount" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
            ) : r.type === "balance" ? (
              <span className="col-span-4 self-center text-xs text-[var(--color-muted)]">Absorbs the remaining CTC.</span>
            ) : (
              <>
                <input className="input col-span-2" type="number" placeholder="%" value={r.percent} onChange={(e) => update(i, { percent: e.target.value })} />
                <select className="input col-span-2" value={r.percent_of} onChange={(e) => update(i, { percent_of: e.target.value })}>
                  <option value="">of gross</option>
                  <option value="CTC">of CTC</option>
                  {earningCodes.filter((c) => c && c !== r.code).map((c) => (
                    <option key={c} value={c}>of {c}</option>
                  ))}
                </select>
              </>
            )}
            <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="col-span-1 flex justify-center text-[var(--color-danger)]">
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
