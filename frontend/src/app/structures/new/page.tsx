"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Employee, estimateSalary } from "@/lib/api";
import styles from "../structures.module.css";

interface ComponentInput {
  name: string;
  type: string;
  value: number;
}

export default function NewStructurePage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [ctc, setCtc] = useState(1200000);
  const [currency, setCurrency] = useState("INR");
  const [payFrequency, setPayFrequency] = useState("MONTHLY");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [isActive, setIsActive] = useState(true);

  // Dynamic earnings components
  const [earnings, setEarnings] = useState<ComponentInput[]>([
    { name: "basic", type: "percentage", value: 50 },
    { name: "allowance", type: "fixed", value: 10000 }
  ]);

  // Dynamic deductions components
  const [deductions, setDeductions] = useState<ComponentInput[]>([
    { name: "pf", type: "percentage", value: 12 },
    { name: "tax", type: "fixed", value: 5000 }
  ]);

  useEffect(() => {
    api.getEmployees().then((data) => {
      setEmployees(data);
      if (data.length > 0) setEmployeeId(data[0].id);
    }).catch(() => {});
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live estimate of monthly gross / net (full month, no LOP) shown before saving
  const componentsObj = Object.fromEntries(
    earnings.filter((c) => c.name.trim()).map((c) => [c.name.trim(), { type: c.type, value: Number(c.value) }])
  );
  const deductionsObj = Object.fromEntries(
    deductions.filter((d) => d.name.trim()).map((d) => [d.name.trim(), { type: d.type, value: Number(d.value) }])
  );
  const estimate = estimateSalary(Number(ctc), componentsObj, deductionsObj);

  const handleAddComponent = (target: "earnings" | "deductions") => {
    const newComp: ComponentInput = { name: "", type: "fixed", value: 0 };
    if (target === "earnings") {
      setEarnings([...earnings, newComp]);
    } else {
      setDeductions([...deductions, newComp]);
    }
  };

  const handleRemoveComponent = (target: "earnings" | "deductions", index: number) => {
    if (target === "earnings") {
      setEarnings(earnings.filter((_, i) => i !== index));
    } else {
      setDeductions(deductions.filter((_, i) => i !== index));
    }
  };

  const handleComponentChange = (
    target: "earnings" | "deductions",
    index: number,
    field: keyof ComponentInput,
    val: any
  ) => {
    const list = target === "earnings" ? [...earnings] : [...deductions];
    list[index] = { ...list[index], [field]: val };
    if (target === "earnings") {
      setEarnings(list);
    } else {
      setDeductions(list);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Reconstruct into required schema formats
    const componentsObj: Record<string, { type: string; value: number }> = {};
    for (const comp of earnings) {
      if (!comp.name.trim()) continue;
      componentsObj[comp.name.trim()] = { type: comp.type, value: Number(comp.value) };
    }

    const deductionsObj: Record<string, { type: string; value: number }> = {};
    for (const ded of deductions) {
      if (!ded.name.trim()) continue;
      deductionsObj[ded.name.trim()] = { type: ded.type, value: Number(ded.value) };
    }

    const payload = {
      employee_id: Number(employeeId),
      ctc: Number(ctc),
      currency,
      pay_frequency: payFrequency,
      effective_from: effectiveFrom,
      components: componentsObj,
      default_deductions: deductionsObj,
      is_active: isActive
    };

    try {
      await api.createStructure(payload);
      router.push("/structures");
    } catch (err: any) {
      setError(err.message || "Failed to create structure");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>New Salary Structure</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Create a custom structural payroll component set for an employee.
          </p>
        </div>
      </header>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className={styles.card}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Select Employee</label>
              <select
                className={styles.select}
                value={employeeId}
                onChange={(e) => setEmployeeId(Number(e.target.value))}
                required
              >
                {employees.length === 0 && <option value="">No employees found — add one first</option>}
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} (ID: {emp.id})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Annual CTC</label>
              <input
                type="number"
                className={styles.input}
                value={ctc}
                onChange={(e) => setCtc(Number(e.target.value))}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Currency</label>
              <input
                type="text"
                className={styles.input}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Pay Frequency</label>
              <select
                className={styles.select}
                value={payFrequency}
                onChange={(e) => setPayFrequency(e.target.value)}
              >
                <option value="MONTHLY">MONTHLY</option>
                <option value="WEEKLY">WEEKLY</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Effective From</label>
              <input
                type="date"
                className={styles.input}
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup} style={{ justifyContent: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                />
                Is Active Structure
              </label>
            </div>
          </div>

          {/* Earnings Components */}
          <div className={styles.compSection}>
            <div className={styles.compHeader}>
              <span>Earnings Components</span>
              <button
                type="button"
                onClick={() => handleAddComponent("earnings")}
                className="btn btnSecondary"
                style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", cursor: "pointer" }}
              >
                + Add Component
              </button>
            </div>
            {earnings.map((comp, idx) => (
              <div key={idx} className={styles.compRow}>
                <input
                  type="text"
                  placeholder="Component Name (e.g. hra)"
                  className={styles.input}
                  value={comp.name}
                  onChange={(e) => handleComponentChange("earnings", idx, "name", e.target.value)}
                  required
                />
                <select
                  className={styles.select}
                  value={comp.type}
                  onChange={(e) => handleComponentChange("earnings", idx, "type", e.target.value)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                <input
                  type="number"
                  placeholder="Value"
                  step="0.01"
                  className={styles.input}
                  value={comp.value}
                  onChange={(e) => handleComponentChange("earnings", idx, "value", Number(e.target.value))}
                  required
                />
                <button
                  type="button"
                  onClick={() => handleRemoveComponent("earnings", idx)}
                  className={styles.btnRemove}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Deductions Components */}
          <div className={styles.compSection}>
            <div className={styles.compHeader}>
              <span>Deductions Components</span>
              <button
                type="button"
                onClick={() => handleAddComponent("deductions")}
                className="btn btnSecondary"
                style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", cursor: "pointer" }}
              >
                + Add Deduction
              </button>
            </div>
            {deductions.map((ded, idx) => (
              <div key={idx} className={styles.compRow}>
                <input
                  type="text"
                  placeholder="Deduction Name (e.g. pf)"
                  className={styles.input}
                  value={ded.name}
                  onChange={(e) => handleComponentChange("deductions", idx, "name", e.target.value)}
                  required
                />
                <select
                  className={styles.select}
                  value={ded.type}
                  onChange={(e) => handleComponentChange("deductions", idx, "type", e.target.value)}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                <input
                  type="number"
                  placeholder="Value"
                  step="0.01"
                  className={styles.input}
                  value={ded.value}
                  onChange={(e) => handleComponentChange("deductions", idx, "value", Number(e.target.value))}
                  required
                />
                <button
                  type="button"
                  onClick={() => handleRemoveComponent("deductions", idx)}
                  className={styles.btnRemove}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Live estimate (full month, before LOP) */}
          <div className={styles.compSection} style={{ backgroundColor: "var(--bg-card)" }}>
            <div className={styles.compHeader} style={{ borderBottom: "none", paddingBottom: 0 }}>
              <span>Estimated Monthly Salary</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
                Full month · before LOP / proration
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Gross Earnings</span>
                <strong style={{ fontSize: "1.25rem" }}>
                  ₹{estimate.gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Total Deductions</span>
                <strong style={{ fontSize: "1.25rem", color: "var(--danger-text)" }}>
                  - ₹{estimate.totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Net Pay</span>
                <strong style={{ fontSize: "1.4rem", color: "var(--secondary)", fontWeight: 700 }}>
                  ₹{estimate.net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button
              type="submit"
              disabled={saving}
              className="btn btnPrimary"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--text-main)",
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                cursor: "pointer",
                border: "none"
              }}
            >
              {saving ? "Creating..." : "Save Structure"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/structures")}
              className="btn btnSecondary"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-main)",
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-color)",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
