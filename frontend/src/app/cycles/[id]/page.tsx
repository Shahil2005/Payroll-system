"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, PayrollCycle, Payslip, Employee } from "@/lib/api";
import styles from "../cycles.module.css";
import dashboardStyles from "../../page.module.css";

interface SkippedEmployee {
  employee_id: number;
  reason: string;
}

export default function CycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const cycleId = Number(resolvedParams.id);

  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [skipped, setSkipped] = useState<SkippedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDetails() {
    setLoading(true);
    try {
      const cycleData = await api.getCycle(cycleId);
      setCycle(cycleData);

      // Payslips are only fetched/available after running the payroll (PROCESSING/APPROVED/PAID statuses)
      if (cycleData.status !== "DRAFT") {
        const payslipsData = await api.getCyclePayslips(cycleId);
        setPayslips(payslipsData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load cycle details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [cycleId]);

  const handleRunPayroll = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.runCycle(cycleId);
      setSkipped(res.skipped as SkippedEmployee[]);
      await loadDetails();
    } catch (err: any) {
      setError(err.message || "Failed to run payroll calculations");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePayroll = async () => {
    if (!confirm("Are you sure you want to approve this payroll cycle? This will lock calculations.")) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await api.approveCycle(cycleId);
      await loadDetails();
    } catch (err: any) {
      setError(err.message || "Failed to approve payroll cycle");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!confirm("Are you sure you want to mark this cycle as PAID? This will update all payslips and record a payment timestamp.")) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await api.markPaidCycle(cycleId);
      await loadDetails();
    } catch (err: any) {
      setError(err.message || "Failed to mark payroll as paid");
    } finally {
      setActionLoading(false);
    }
  };

  const getEmployeeName = (empId: number) => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : `Employee #${empId}`;
  };

  if (loading) {
    return <p style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading payroll cycle details...</p>;
  }

  if (!cycle) {
    return <p style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Payroll cycle not found.</p>;
  }

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <Link href="/cycles" className={dashboardStyles.btnLink} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.5rem" }}>
            ← Back to Cycles
          </Link>
          <h1 className={styles.title}>{cycle.name}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Period: {cycle.period_start} to {cycle.period_end}
          </p>
        </div>
        <div>
          <span className={`${dashboardStyles.badge} ${dashboardStyles[cycle.status.toLowerCase()]}`} style={{ fontSize: "0.9rem", padding: "0.4rem 0.8rem" }}>
            {cycle.status}
          </span>
        </div>
      </header>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Skipped employees from the most recent run — not included in payroll */}
      {skipped.length > 0 && (
        <div style={{ padding: "1rem 1.25rem", backgroundColor: "var(--status-draft-bg)", color: "var(--status-draft-text)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <strong>{skipped.length} employee{skipped.length > 1 ? "s were" : " was"} skipped — no active salary structure</strong>
            <button
              onClick={() => setSkipped([])}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8rem" }}
            >
              Dismiss
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
            {skipped.map((s) => (
              <li key={s.employee_id} style={{ marginBottom: "0.25rem" }}>
                {getEmployeeName(s.employee_id)} (ID: {s.employee_id}) —{" "}
                <Link href="/structures/new" className={dashboardStyles.btnLink}>configure salary →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.detailGrid}>
        {/* Left: Cycle Details & Meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className={styles.card} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <h3 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>Cycle Overview</h3>
            
            <div className={styles.infoGroup}>
              <span className={styles.infoLabel}>Scheduled Pay Date</span>
              <span className={styles.infoValue}>{cycle.pay_date}</span>
            </div>

            {cycle.paid_at && (
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>Disbursement Date</span>
                <span className={styles.infoValue} style={{ color: "var(--secondary)" }}>
                  {new Date(cycle.paid_at).toLocaleString()}
                </span>
              </div>
            )}

            {cycle.notes && (
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>Notes</span>
                <span className={styles.infoValue} style={{ fontWeight: "normal", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {cycle.notes}
                </span>
              </div>
            )}
          </div>

          {/* Aggregated Totals Card */}
          {cycle.status !== "DRAFT" && (
            <div className={styles.card} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <h3 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>Cycle Financials</h3>
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>Gross Earnings</span>
                <span className={styles.infoValue} style={{ fontSize: "1.2rem" }}>
                  ₹{Number(cycle.totals?.gross_earnings || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.infoGroup}>
                <span className={styles.infoLabel}>Total Deductions</span>
                <span className={styles.infoValue} style={{ color: "var(--danger-text)", fontSize: "1.2rem" }}>
                  - ₹{Number(cycle.totals?.total_deductions || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className={styles.infoGroup} style={{ borderTop: "1px dashed var(--border-color)", paddingTop: "0.75rem" }}>
                <span className={styles.infoLabel}>Net Disbursement</span>
                <span className={styles.infoValue} style={{ color: "var(--secondary)", fontSize: "1.4rem", fontWeight: 700 }}>
                  ₹{Number(cycle.totals?.net_pay || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* Action Operations Control Panel */}
          <div className={styles.card} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>Lifecycle Controls</h3>
            
            {cycle.status === "DRAFT" && (
              <button
                onClick={handleRunPayroll}
                disabled={actionLoading}
                className="btn btnPrimary"
                style={{ width: "100%", padding: "0.75rem", cursor: "pointer", border: "none" }}
              >
                {actionLoading ? "Processing Calculations..." : "Run Payroll Calculations"}
              </button>
            )}

            {cycle.status === "PROCESSING" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <button
                  onClick={handleApprovePayroll}
                  disabled={actionLoading}
                  className="btn btnPrimary"
                  style={{ width: "100%", padding: "0.75rem", cursor: "pointer", border: "none" }}
                >
                  {actionLoading ? "Processing..." : "Approve Payroll"}
                </button>
                <button
                  onClick={handleRunPayroll}
                  disabled={actionLoading}
                  className="btn btnSecondary"
                  style={{ width: "100%", padding: "0.75rem", cursor: "pointer" }}
                >
                  Recalculate (Re-Run)
                </button>
              </div>
            )}

            {cycle.status === "APPROVED" && (
              <button
                onClick={handleMarkPaid}
                disabled={actionLoading}
                className="btn btnPrimary"
                style={{ width: "100%", padding: "0.75rem", cursor: "pointer", border: "none", backgroundColor: "var(--secondary)" }}
              >
                {actionLoading ? "Recording payments..." : "Mark as PAID"}
              </button>
            )}

            {cycle.status === "PAID" && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center", fontStyle: "italic" }}>
                This payroll cycle has been disbursed. No further operations are allowed.
              </p>
            )}
          </div>
        </div>

        {/* Right: Employee Payslips List */}
        <div className={styles.card}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem" }}>Individual Employee Payslips</h3>

          {cycle.status === "DRAFT" ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
              <p>Payroll calculations have not been executed yet.</p>
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>Click "Run Payroll Calculations" in the left panel to generate payslips.</p>
            </div>
          ) : payslips.length === 0 ? (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No payslips found in this cycle.</p>
          ) : (
            <div className={dashboardStyles.tableWrapper}>
              <table className={dashboardStyles.table}>
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>LOP / Paid</th>
                    <th style={{ textAlign: "right" }}>Gross Earnings</th>
                    <th style={{ textAlign: "right" }}>Deductions</th>
                    <th style={{ textAlign: "right" }}>Net Pay</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((slip) => (
                    <tr key={slip.id}>
                      <td>
                        <strong>{getEmployeeName(slip.employee_id)}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>ID: {slip.employee_id}</div>
                      </td>
                      <td>
                        <span style={{ color: Number(slip.lop_days) > 0 ? "var(--danger-text)" : "var(--text-muted)" }}>
                          {slip.lop_days} LOP
                        </span>
                        {" / "}
                        <span style={{ color: "var(--secondary)" }}>
                          {slip.paid_days} Paid
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        ₹{Number(slip.gross_earnings).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--danger-text)" }}>
                        - ₹{Number(slip.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>₹{Number(slip.net_pay).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/payslips/${slip.id}`} className="btn btnSecondary" style={{
                          backgroundColor: "var(--bg-hover)",
                          color: "var(--text-main)",
                          padding: "0.35rem 0.7rem",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                          border: "1px solid var(--border-color)",
                          cursor: "pointer"
                        }}>
                          View Payslip
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
