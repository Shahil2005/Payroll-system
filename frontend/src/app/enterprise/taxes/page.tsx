"use client";

import { useEffect, useState } from "react";
import {
  payrollApi,
  taxesApi,
  inr,
  type Employee,
  type TaxProfile,
  type TaxRegime,
  type TdsChallan,
  type TdsLiabilityRow,
} from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

const DECLARATION_FIELDS: { key: keyof DeclForm; label: string; hint?: string }[] = [
  { key: "declared_80c", label: "Section 80C", hint: "PF, ELSS, LIC, etc. (max ₹1.5L)" },
  { key: "declared_80d", label: "Section 80D", hint: "Medical insurance premium" },
  { key: "declared_hra_rent", label: "Annual Rent (HRA)", hint: "For HRA exemption" },
  { key: "declared_home_loan_interest", label: "Home Loan Interest", hint: "Section 24(b)" },
  { key: "declared_other", label: "Other Exemptions" },
  { key: "prev_employer_income", label: "Previous Employer Income" },
  { key: "prev_employer_tds", label: "Previous Employer TDS" },
];

interface DeclForm {
  tax_regime: TaxRegime;
  declared_80c: string;
  declared_80d: string;
  declared_hra_rent: string;
  declared_home_loan_interest: string;
  declared_other: string;
  prev_employer_income: string;
  prev_employer_tds: string;
}

const BLANK_DECL: DeclForm = {
  tax_regime: "NEW",
  declared_80c: "",
  declared_80d: "",
  declared_hra_rent: "",
  declared_home_loan_interest: "",
  declared_other: "",
  prev_employer_income: "",
  prev_employer_tds: "",
};

const BLANK_CHALLAN = {
  period_month: "",
  amount: "",
  challan_number: "",
  bsr_code: "",
  deposit_date: "",
  interest: "",
  penalty: "",
  notes: "",
};

const declaredTotal = (p: TaxProfile) =>
  Number(p.declared_80c) +
  Number(p.declared_80d) +
  Number(p.declared_hra_rent) +
  Number(p.declared_home_loan_interest) +
  Number(p.declared_other);

export default function TaxesPage() {
  const { can } = useAuth();
  const { confirm } = useDialog();
  const canEdit = can("payroll:configure");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<TaxProfile[]>([]);
  const [challans, setChallans] = useState<TdsChallan[]>([]);
  const [liabilities, setLiabilities] = useState<TdsLiabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Declaration modal
  const [declEmp, setDeclEmp] = useState<Employee | null>(null);
  const [declForm, setDeclForm] = useState<DeclForm>(BLANK_DECL);
  const [declErr, setDeclErr] = useState<string | null>(null);
  const [declSaving, setDeclSaving] = useState(false);

  // Challan modal
  const [challanOpen, setChallanOpen] = useState(false);
  const [challanForm, setChallanForm] = useState(BLANK_CHALLAN);
  const [challanErr, setChallanErr] = useState<string | null>(null);
  const [challanSaving, setChallanSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [emps, profs, chs, libs] = await Promise.all([
        payrollApi.listEmployees(),
        taxesApi.listProfiles(),
        taxesApi.listChallans(),
        taxesApi.tdsLiabilities(),
      ]);
      setEmployees(emps);
      setProfiles(profs);
      setChallans(chs);
      setLiabilities(libs);
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

  const profileFor = (employeeId: string) =>
    profiles.find((p) => p.employee_id === employeeId) ?? null;

  function openDeclaration(emp: Employee) {
    const p = profileFor(emp.id);
    setDeclEmp(emp);
    setDeclErr(null);
    setDeclForm(
      p
        ? {
            tax_regime: p.tax_regime,
            declared_80c: String(p.declared_80c),
            declared_80d: String(p.declared_80d),
            declared_hra_rent: String(p.declared_hra_rent),
            declared_home_loan_interest: String(p.declared_home_loan_interest),
            declared_other: String(p.declared_other),
            prev_employer_income: String(p.prev_employer_income),
            prev_employer_tds: String(p.prev_employer_tds),
          }
        : BLANK_DECL
    );
  }

  async function saveDeclaration(e: React.FormEvent) {
    e.preventDefault();
    if (!declEmp) return;
    setDeclErr(null);
    setDeclSaving(true);
    try {
      await taxesApi.upsertProfile(declEmp.id, {
        tax_regime: declForm.tax_regime,
        declared_80c: Number(declForm.declared_80c) || 0,
        declared_80d: Number(declForm.declared_80d) || 0,
        declared_hra_rent: Number(declForm.declared_hra_rent) || 0,
        declared_home_loan_interest: Number(declForm.declared_home_loan_interest) || 0,
        declared_other: Number(declForm.declared_other) || 0,
        prev_employer_income: Number(declForm.prev_employer_income) || 0,
        prev_employer_tds: Number(declForm.prev_employer_tds) || 0,
      });
      setDeclEmp(null);
      await load();
    } catch (err) {
      setDeclErr((err as Error).message);
    } finally {
      setDeclSaving(false);
    }
  }

  async function saveChallan(e: React.FormEvent) {
    e.preventDefault();
    setChallanErr(null);
    setChallanSaving(true);
    try {
      await taxesApi.createChallan({
        period_month: challanForm.period_month,
        amount: Number(challanForm.amount) || 0,
        challan_number: challanForm.challan_number,
        bsr_code: challanForm.bsr_code || null,
        deposit_date: challanForm.deposit_date,
        interest: Number(challanForm.interest) || 0,
        penalty: Number(challanForm.penalty) || 0,
        notes: challanForm.notes || null,
      });
      setChallanOpen(false);
      setChallanForm(BLANK_CHALLAN);
      await load();
    } catch (err) {
      setChallanErr((err as Error).message);
    } finally {
      setChallanSaving(false);
    }
  }

  async function removeChallan(ch: TdsChallan) {
    const ok = await confirm({
      title: "Delete challan",
      message: `Delete challan ${ch.challan_number} (${inr(ch.amount)})?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await taxesApi.deleteChallan(ch.id);
      setChallans((prev) => prev.filter((c) => c.id !== ch.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const empName = (e: Employee) => `${e.first_name} ${e.last_name}`.trim();

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Taxes &amp; Forms</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Income-tax declarations and TDS challan records.
        </p>
      </header>

      <Banner tone="warn">
        TDS is computed automatically as an <strong>estimate</strong> (versioned, FY2025-26 basis) when
        enabled on a salary structure — it&apos;s not filing-grade. Form 16 and Form 24Q are still to come.
      </Banner>

      {error && <Banner>{error}</Banner>}

      {/* --- TDS Liabilities (deducted vs deposited) --- */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <div className="mb-4 border-b border-[var(--color-border)] pb-3">
          <h2 className="font-semibold">TDS Liabilities</h2>
          <p className="text-xs text-[var(--color-muted)]">
            TDS withheld on payslips vs. deposited via recorded challans, by month.
          </p>
        </div>
        {loading ? (
          <p className="py-6 text-center text-[var(--color-muted)]">Loading…</p>
        ) : liabilities.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">
            No TDS withheld yet. Enable Income Tax (TDS) on a salary structure and run payroll.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Deducted</th>
                  <th className="px-3 py-2 text-right">Deposited</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {liabilities.map((row) => {
                  const bal = Number(row.difference);
                  return (
                    <tr key={row.period_month} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2 font-medium">{row.period_month}</td>
                      <td className="px-3 py-2 text-right">{inr(row.tds_deducted)}</td>
                      <td className="px-3 py-2 text-right">{inr(row.tds_deposited)}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          bal > 0
                            ? "text-[var(--color-danger)]"
                            : "text-[var(--color-accent)]"
                        }`}
                      >
                        {bal > 0 ? `${inr(bal)} due` : "Settled"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- TDS Challans --- */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <div>
            <h2 className="font-semibold">TDS Challans</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Record TDS payments made to the government.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setChallanErr(null);
                setChallanForm(BLANK_CHALLAN);
                setChallanOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Record Challan
            </button>
          )}
        </div>
        {loading ? (
          <p className="py-6 text-center text-[var(--color-muted)]">Loading…</p>
        ) : challans.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">No challans recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Challan No.</th>
                  <th className="px-3 py-2">BSR Code</th>
                  <th className="px-3 py-2">Deposited</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {challans.map((ch) => (
                  <tr key={ch.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2">{ch.period_month}</td>
                    <td className="px-3 py-2 font-mono text-xs">{ch.challan_number}</td>
                    <td className="px-3 py-2 font-mono text-xs">{ch.bsr_code || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{ch.deposit_date}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inr(ch.amount)}</td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeChallan(ch)}
                          title="Delete challan"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-dim)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- IT Declarations --- */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <div className="mb-4 border-b border-[var(--color-border)] pb-3">
          <h2 className="font-semibold">Income-Tax Declarations</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Each employee&apos;s tax regime and declared investments/exemptions for the year.
          </p>
        </div>
        {loading ? (
          <p className="py-6 text-center text-[var(--color-muted)]">Loading…</p>
        ) : employees.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">No employees yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Regime</th>
                  <th className="px-3 py-2 text-right">Total Declared</th>
                  <th className="px-3 py-2">Status</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const p = profileFor(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-2 font-medium">{empName(emp)}</td>
                      <td className="px-3 py-2">
                        {p ? (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              p.tax_regime === "NEW"
                                ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                                : "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                            }`}
                          >
                            {p.tax_regime}
                          </span>
                        ) : (
                          <span className="text-[var(--color-dim)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{p ? inr(declaredTotal(p)) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                        {p ? "Declared" : "Not declared"}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openDeclaration(emp)}
                            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-hover)]"
                          >
                            {p ? "Edit" : "Add"}
                          </button>
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

      {/* Challan modal */}
      {challanOpen && (
        <Modal title="Record TDS Challan" onClose={() => setChallanOpen(false)}>
          <form onSubmit={saveChallan} className="flex flex-col gap-4">
            {challanErr && <Banner>{challanErr}</Banner>}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Liability Month</span>
                <input
                  className="input"
                  type="month"
                  required
                  value={challanForm.period_month}
                  onChange={(e) => setChallanForm({ ...challanForm, period_month: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Amount</span>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={challanForm.amount}
                  onChange={(e) => setChallanForm({ ...challanForm, amount: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Challan Number</span>
                <input
                  className="input"
                  required
                  value={challanForm.challan_number}
                  onChange={(e) => setChallanForm({ ...challanForm, challan_number: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">BSR Code</span>
                <input
                  className="input"
                  value={challanForm.bsr_code}
                  onChange={(e) => setChallanForm({ ...challanForm, bsr_code: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Deposit Date</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={challanForm.deposit_date}
                  onChange={(e) => setChallanForm({ ...challanForm, deposit_date: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Interest</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={challanForm.interest}
                  onChange={(e) => setChallanForm({ ...challanForm, interest: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Penalty</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={challanForm.penalty}
                  onChange={(e) => setChallanForm({ ...challanForm, penalty: e.target.value })}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Notes (optional)</span>
              <input
                className="input"
                value={challanForm.notes}
                onChange={(e) => setChallanForm({ ...challanForm, notes: e.target.value })}
              />
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={challanSaving} className="btn-primary">
                {challanSaving ? "Saving…" : "Record Challan"}
              </button>
              <button
                type="button"
                onClick={() => setChallanOpen(false)}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Declaration modal */}
      {declEmp && (
        <Modal title={`IT Declaration — ${empName(declEmp)}`} onClose={() => setDeclEmp(null)}>
          <form onSubmit={saveDeclaration} className="flex flex-col gap-4">
            {declErr && <Banner>{declErr}</Banner>}
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Tax Regime</span>
              <select
                className="input"
                value={declForm.tax_regime}
                onChange={(e) => setDeclForm({ ...declForm, tax_regime: e.target.value as TaxRegime })}
              >
                <option value="NEW">New Regime (default)</option>
                <option value="OLD">Old Regime</option>
              </select>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DECLARATION_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="lbl">{f.label}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={declForm[f.key]}
                    onChange={(e) => setDeclForm({ ...declForm, [f.key]: e.target.value })}
                  />
                  {f.hint && <span className="text-xs text-[var(--color-dim)]">{f.hint}</span>}
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={declSaving} className="btn-primary">
                {declSaving ? "Saving…" : "Save Declaration"}
              </button>
              <button
                type="button"
                onClick={() => setDeclEmp(null)}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
