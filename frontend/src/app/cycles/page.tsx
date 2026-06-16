"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, PayrollCycle } from "@/lib/api";
import styles from "./cycles.module.css";
import dashboardStyles from "../page.module.css";

export default function CyclesPage() {
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadCycles() {
    setLoading(true);
    try {
      const data = await api.getCycles();
      setCycles(data);
    } catch (err: any) {
      setError(err.message || "Failed to load payroll cycles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCycles();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createCycle({
        name,
        period_start: periodStart,
        period_end: periodEnd,
        pay_date: payDate,
        notes
      });
      setShowModal(false);
      // Reset fields
      setName("");
      setPeriodStart("");
      setPeriodEnd("");
      setPayDate("");
      setNotes("");
      loadCycles();
    } catch (err: any) {
      alert(`Create failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this payroll cycle? This action cannot be undone.")) {
      return;
    }
    try {
      await api.deleteCycle(id);
      loadCycles();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Payroll Cycles</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Create and execute monthly employee payroll runs.
          </p>
        </div>
        <button
          onClick={() => {
            const today = new Date();
            const y = today.getFullYear();
            const m = today.getMonth(); // current month (0-indexed)
            
            // Default to start and end of current month
            const start = new Date(y, m, 1).toISOString().split("T")[0];
            const end = new Date(y, m + 1, 0).toISOString().split("T")[0];
            const pay = new Date(y, m + 1, 0).toISOString().split("T")[0];
            
            setName(`${today.toLocaleString('default', { month: 'long' })} ${y} Payroll`);
            setPeriodStart(start);
            setPeriodEnd(end);
            setPayDate(pay);
            setShowModal(true);
          }}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Cycle
        </button>
      </header>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>Loading payroll cycles...</p>
      ) : cycles.length === 0 ? (
        <div className={styles.card} style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <svg style={{ width: 48, height: 48, color: "var(--text-dim)", marginBottom: "1rem" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 style={{ marginBottom: "0.5rem" }}>No Payroll Cycles Created Yet</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Get started by creating a payroll cycle for the current month.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {cycles.map((cycle) => (
            <div key={cycle.id} className={styles.cycleCard}>
              <div className={styles.cycleHeader}>
                <div>
                  <h3 className={styles.cycleTitle}>{cycle.name}</h3>
                  <span className={styles.cycleDates}>
                    {cycle.period_start} to {cycle.period_end}
                  </span>
                </div>
                <span className={`${dashboardStyles.badge} ${dashboardStyles[cycle.status.toLowerCase()]}`}>
                  {cycle.status}
                </span>
              </div>

              {cycle.notes && <p className={styles.cycleNotes}>{cycle.notes}</p>}

              <div className={styles.cycleTotals}>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.75rem" }}>Gross pay</span>
                  <span className={styles.totalsVal}>₹{Number(cycle.totals?.gross_earnings || 0).toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.75rem" }}>Net pay</span>
                  <span className={styles.totalsVal} style={{ color: "var(--primary)" }}>₹{Number(cycle.totals?.net_pay || 0).toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className={styles.cycleFooter}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  Pay Date: {cycle.pay_date}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {cycle.status === "DRAFT" && (
                    <button
                      onClick={() => handleDelete(cycle.id)}
                      className="btn"
                      style={{
                        backgroundColor: "var(--danger-bg)",
                        color: "var(--danger-text)",
                        padding: "0.35rem 0.7rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        border: "none"
                      }}
                    >
                      Delete
                    </button>
                  )}
                  <Link href={`/cycles/${cycle.id}`} className="btn btnPrimary" style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--text-main)",
                    padding: "0.35rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    fontWeight: 600
                  }}>
                    Manage
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cycle Creation Modal Overlay */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Create Payroll Cycle</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label className={styles.infoLabel}>Cycle Name</label>
                <input
                  type="text"
                  className={styles.totalsVal}
                  style={{
                    backgroundColor: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem",
                    color: "var(--text-main)",
                    fontWeight: "normal",
                    fontSize: "0.9rem"
                  }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label className={styles.infoLabel}>Start Date</label>
                  <input
                    type="date"
                    style={{
                      backgroundColor: "var(--bg-main)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.75rem",
                      color: "var(--text-main)",
                      fontSize: "0.9rem"
                    }}
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label className={styles.infoLabel}>End Date</label>
                  <input
                    type="date"
                    style={{
                      backgroundColor: "var(--bg-main)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.75rem",
                      color: "var(--text-main)",
                      fontSize: "0.9rem"
                    }}
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label className={styles.infoLabel}>Pay Date</label>
                <input
                  type="date"
                  style={{
                    backgroundColor: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem",
                    color: "var(--text-main)",
                    fontSize: "0.9rem"
                  }}
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label className={styles.infoLabel}>Notes</label>
                <textarea
                  style={{
                    backgroundColor: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem",
                    color: "var(--text-main)",
                    fontSize: "0.9rem",
                    minHeight: "80px",
                    resize: "vertical"
                  }}
                  placeholder="Optional notes or description..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
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
                    border: "none",
                    flex: 1
                  }}
                >
                  {saving ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btnSecondary"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-main)",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                    flex: 1
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
