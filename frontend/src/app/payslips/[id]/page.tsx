"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, Payslip, Employee, PayrollCycle } from "@/lib/api";
import styles from "../../cycles/cycles.module.css";
import dashboardStyles from "../../page.module.css";

export default function PayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const payslipId = Number(resolvedParams.id);

  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPayslipData() {
      try {
        const slip = await api.getPayslip(payslipId);
        setPayslip(slip);

        const cycleData = await api.getCycle(slip.cycle_id);
        setCycle(cycleData);
      } catch (err: any) {
        setError(err.message || "Failed to load payslip data");
      } finally {
        setLoading(false);
      }
    }
    loadPayslipData();
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [payslipId]);

  const employee = payslip ? employees.find((e) => e.id === payslip.employee_id) : null;

  if (loading) {
    return <p style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading payslip details...</p>;
  }

  if (!payslip || !cycle) {
    return <p style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Payslip not found.</p>;
  }

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={`${styles.header} no-print`}>
        <div>
          <Link href={`/cycles/${payslip.cycle_id}`} className={dashboardStyles.btnLink}>
            ← Back to Cycle details
          </Link>
          <h1 className={styles.title} style={{ marginTop: "0.5rem" }}>Employee Payslip</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => window.print()}
            className="btn btnPrimary"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--text-main)",
              padding: "0.75rem 1.25rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Payslip
          </button>
        </div>
      </header>

      {error && (
        <div className="no-print" style={{ padding: "1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Payslip Document */}
      <div className={styles.payslipCard}>
        <div className={styles.payslipHeader}>
          <div>
            <div className={styles.payslipLogo}>CROAR</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Croar Technologies Private Limited
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>PAYSLIP RECEIPT</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Payslip Ref: #{payslip.id}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.5rem",
          backgroundColor: "var(--bg-main)",
          padding: "1.25rem",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)",
          marginBottom: "2rem"
        }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>EMPLOYEE NAME</span>
            <strong>{employee ? `${employee.first_name} ${employee.last_name}` : `Employee #${payslip.employee_id}`}</strong>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>EMAIL ADDRESS</span>
            <span>{employee?.email || "N/A"}</span>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>STATEMENT PERIOD</span>
            <span>{cycle.period_start} to {cycle.period_end}</span>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>PAY DATE</span>
            <span>{cycle.pay_date}</span>
          </div>
        </div>

        {/* Earnings & Deductions Tables */}
        <div className={styles.payslipGrid}>
          {/* Earnings */}
          <div>
            <h4 className={styles.payslipTitle}>Earnings</h4>
            <div style={{ minHeight: "150px" }}>
              {Object.entries(payslip.earnings).map(([compName, amt]) => (
                <div key={compName} className={styles.payslipRow}>
                  <span style={{ textTransform: "capitalize" }}>{compName}</span>
                  <strong>₹{Number(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                </div>
              ))}
            </div>
            <div className={styles.payslipRow} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", marginTop: "1rem" }}>
              <strong>Total Gross Earnings</strong>
              <strong style={{ color: "var(--text-main)" }}>₹{Number(payslip.gross_earnings).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h4 className={styles.payslipTitle} style={{ borderBottomColor: "var(--border-color)" }}>Deductions</h4>
            <div style={{ minHeight: "150px" }}>
              {Object.entries(payslip.deductions).map(([dedName, amt]) => (
                <div key={dedName} className={styles.payslipRow}>
                  <span style={{ textTransform: "capitalize" }}>{dedName}</span>
                  <strong>- ₹{Number(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                </div>
              ))}
            </div>
            <div className={styles.payslipRow} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", marginTop: "1rem" }}>
              <strong>Total Deductions</strong>
              <strong style={{ color: "var(--danger-text)" }}>- ₹{Number(payslip.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>
        </div>

        {/* Working Days & Proration Snapshot */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1rem",
          backgroundColor: "var(--bg-main)",
          padding: "1rem",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.85rem",
          border: "1px solid var(--border-color)",
          textAlign: "center"
        }}>
          <div>
            <span style={{ color: "var(--text-muted)", display: "block" }}>Total Period Days</span>
            <strong>{Number(payslip.paid_days) + Number(payslip.lop_days)} Days</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", display: "block" }}>Loss of Pay (LOP) Days</span>
            <strong style={{ color: Number(payslip.lop_days) > 0 ? "var(--danger-text)" : "var(--text-main)" }}>
              {payslip.lop_days} Days
            </strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", display: "block" }}>Paid Days</span>
            <strong style={{ color: "var(--secondary)" }}>{payslip.paid_days} Days</strong>
          </div>
        </div>

        {/* Total Disbursement Section */}
        <div className={styles.payslipFooter}>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>DISBURSEMENT METHOD</span>
            <strong style={{ fontSize: "0.9rem" }}>Bank Transfer</strong>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>NET PAYOUT</span>
            <strong style={{ fontSize: "1.8rem", color: "var(--secondary)", fontWeight: 700 }}>
              ₹{Number(payslip.net_pay).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      </div>

      {/* CSS stylesheet print override rules */}
      <style jsx global>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .main-content {
            margin-left: 0 !important;
            padding: 0 !important;
            background-color: #ffffff !important;
          }
          .layout-container {
            display: block !important;
          }
          aside {
            display: none !important;
          }
          .${styles.payslipCard} {
            border: none !important;
            box-shadow: none !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .${styles.payslipRow}, .${styles.payslipFooter}, .${styles.payslipHeader} {
            color: #000000 !important;
            border-color: #000000 !important;
          }
          div, span, strong, h3, h4 {
            color: #000000 !important;
          }
          /* High contrast colors for print */
          span[style*="var(--secondary)"], strong[style*="var(--secondary)"] {
            color: #000000 !important;
          }
          strong[style*="var(--danger-text)"] {
            color: #000000 !important;
          }
          div[style*="var(--bg-main)"] {
            background-color: #f3f4f6 !important;
            border-color: #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}
