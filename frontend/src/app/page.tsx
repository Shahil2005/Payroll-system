"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, PayrollCycle, SalaryStructure, Employee } from "@/lib/api";
import styles from "./page.module.css";

export default function Dashboard() {
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedCycles, loadedStructures, loadedEmployees] = await Promise.all([
          api.getCycles(),
          api.getStructures(),
          api.getEmployees()
        ]);
        setCycles(loadedCycles);
        setStructures(loadedStructures);
        setEmployees(loadedEmployees);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalEmployees = employees.length;
  const configuredIds = new Set(structures.filter(s => s.is_active).map(s => s.employee_id));
  const configuredEmployees = configuredIds.size;
  const missingSetup = employees.filter(e => !configuredIds.has(e.id)).length;

  const activeCycles = cycles.filter(c => c.status !== "PAID");

  // Current cycle = most recent non-paid cycle, else most recent of any
  const sortedCycles = [...cycles].sort((a, b) => b.id - a.id);
  const currentCycle = sortedCycles.find(c => c.status !== "PAID") || sortedCycles[0] || null;

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Payroll Dashboard</h1>
          <p className={styles.subtitle}>Overview of Croar employee compensation and payroll cycles.</p>
        </div>
        <div className={styles.dateDisplay}>
          {new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </header>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: 'var(--radius-sm)' }}>
          <strong>Error connecting to backend:</strong> {error}. Please verify the FastAPI server is running on `http://localhost:8000`.
        </div>
      )}

      {/* Metrics Row */}
      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={`${styles.cardIcon}`} style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)' }}>
            <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className={styles.metricVal}>
            {loading ? "..." : totalEmployees}
          </div>
          <div className={styles.metricTitle}>Total Employees</div>
        </div>

        <div className={styles.card}>
          <div className={`${styles.cardIcon}`} style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--secondary)' }}>
            <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className={styles.metricVal}>
            {loading ? "..." : configuredEmployees}
          </div>
          <div className={styles.metricTitle}>Salary Configured</div>
        </div>

        <Link href="/structures/new" className={styles.card} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={`${styles.cardIcon}`} style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger-text)' }}>
            <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <div className={styles.metricVal} style={{ color: missingSetup > 0 ? 'var(--danger-text)' : undefined }}>
            {loading ? "..." : missingSetup}
          </div>
          <div className={styles.metricTitle}>Missing Salary Setup{missingSetup > 0 ? " — configure →" : ""}</div>
        </Link>

        <div className={styles.card}>
          <div className={`${styles.cardIcon}`} style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--status-draft-text)' }}>
            <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
            </svg>
          </div>
          <div className={styles.metricVal}>
            {loading ? "..." : activeCycles.length}
          </div>
          <div className={styles.metricTitle}>Active Cycles</div>
        </div>
      </section>

      {/* Current Cycle Financials */}
      {!loading && currentCycle && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>Current Cycle — {currentCycle.name}</span>
            <span className={`${styles.badge} ${styles[currentCycle.status.toLowerCase()]}`}>{currentCycle.status}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Gross</span>
              <strong style={{ fontSize: '1.4rem' }}>₹{Number(currentCycle.totals?.gross_earnings || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Deductions</span>
              <strong style={{ fontSize: '1.4rem', color: 'var(--danger-text)' }}>- ₹{Number(currentCycle.totals?.total_deductions || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Net Payout</span>
              <strong style={{ fontSize: '1.6rem', color: 'var(--secondary)', fontWeight: 700 }}>₹{Number(currentCycle.totals?.net_pay || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Link href={`/cycles/${currentCycle.id}`} className={styles.btnLink}>Open cycle →</Link>
            </div>
          </div>
        </section>
      )}

      {/* Main Grid Panels */}
      <div className={styles.section}>
        {/* Left: Recent Cycles */}
        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>Recent Payroll Cycles</span>
            <Link href="/cycles" className={styles.btnLink}>View All</Link>
          </div>

          <div className={styles.tableWrapper}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading payroll cycles...</p>
            ) : cycles.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No payroll cycles found. Create one to begin.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cycle Name</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Net Pay</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.slice(0, 5).map((cycle) => (
                    <tr key={cycle.id}>
                      <td><strong>{cycle.name}</strong></td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {cycle.period_start} to {cycle.period_end}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[cycle.status.toLowerCase()]}`}>
                          {cycle.status}
                        </span>
                      </td>
                      <td>
                        ₹{Number(cycle.totals?.net_pay || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <Link href={`/cycles/${cycle.id}`} className={styles.btnLink}>
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Quick Operations</h3>
          <div className={styles.quickActionsList}>
            <Link href="/cycles" className={styles.actionItem}>
              <div style={{ color: 'var(--primary)' }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>New Payroll Cycle</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Create a monthly cycle</div>
              </div>
            </Link>

            <Link href="/structures/new" className={styles.actionItem}>
              <div style={{ color: 'var(--secondary)' }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Add Salary Structure</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Define earnings & deductions</div>
              </div>
            </Link>

            <Link href="/structures" className={styles.actionItem}>
              <div style={{ color: 'var(--status-paid-text)' }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Manage Structures</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View active employee base</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
