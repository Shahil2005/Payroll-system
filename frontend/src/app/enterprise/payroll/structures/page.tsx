"use client";

import { useEffect, useMemo, useState } from "react";
import {
  payrollApi,
  estimateSalary,
  inr,
  type Employee,
  type MoneyLine,
  type SalaryStructure,
} from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

interface LineDraft {
  code: string;
  label: string;
  type: "fixed" | "percent";
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
    .map((r) =>
      r.type === "fixed"
        ? { code: r.code.trim(), label: r.label.trim() || r.code.trim(), type: "fixed", amount: Number(r.amount) || 0 }
        : {
            code: r.code.trim(),
            label: r.label.trim() || r.code.trim(),
            type: "percent",
            percent: Number(r.percent) || 0,
            percent_of: r.percent_of || null,
          }
    );
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

  const empName = (eid: string) => {
    const e = employees.find((x) => x.id === eid);
    return e ? `${e.first_name} ${e.last_name}`.trim() : `Employee ${eid.slice(0, 8)}`;
  };

  const estimate = useMemo(
    () => estimateSalary(toMoneyLines(earnings), toMoneyLines(deductions)),
    [earnings, deductions]
  );
  const earningCodes = earnings.map((e) => e.code).filter(Boolean);

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
    setDeductions([{ ...emptyLine(), code: "PF", label: "Provident Fund", type: "fixed", amount: "1800" }]);
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
      is_active: true,
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
    if (!confirm("Delete this salary structure?")) return;
    try {
      await payrollApi.deleteStructure(id);
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Salary Structures</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Define each employee&apos;s earnings and recurring deductions.
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Structure
          </button>
        )}
      </header>

      {error && <Banner>{error}</Banner>}

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
        {loading ? (
          <p className="p-8 text-center text-[var(--color-muted)]">Loading…</p>
        ) : structures.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-[var(--color-dim)]">tune</span>
            <p className="text-[var(--color-muted)]">No salary structures yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3 text-right">CTC (annual)</th>
                  <th className="px-6 py-3">Frequency</th>
                  <th className="px-6 py-3">Effective</th>
                  {canEdit && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-6 py-4 font-medium">{empName(s.employee_id)}</td>
                    <td className="px-6 py-4 text-right">{inr(s.ctc, s.currency)}</td>
                    <td className="px-6 py-4">{s.pay_frequency}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal title={editingId ? "Edit Salary Structure" : "New Salary Structure"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="flex flex-col gap-5">
            {formErr && <Banner>{formErr}</Banner>}

            <div className="grid grid-cols-2 gap-4">
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
            />

            {/* Live estimate */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">Estimated Monthly Salary</span>
                <span className="text-xs text-[var(--color-muted)]">full month · before LOP</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Gross" value={inr(estimate.gross, currency)} />
                <Stat label="Deductions" value={`- ${inr(estimate.totalDeductions, currency)}`} tone="text-[var(--color-danger)]" />
                <Stat label="Net" value={inr(estimate.net, currency)} tone="text-[var(--color-accent)]" big />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : editingId ? "Update Structure" : "Save Structure"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] py-2.5 text-sm font-semibold">
                Cancel
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
              onChange={(e) => update(i, { type: e.target.value as "fixed" | "percent" })}
            >
              <option value="fixed">Fixed</option>
              <option value="percent">Percent</option>
            </select>
            {r.type === "fixed" ? (
              <input
                className="input col-span-4"
                type="number"
                placeholder="Amount"
                value={r.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
              />
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
    </div>
  );
}
