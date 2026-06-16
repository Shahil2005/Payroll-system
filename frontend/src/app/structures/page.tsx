"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, SalaryStructure, Employee } from "@/lib/api";
import styles from "./structures.module.css";

export default function StructuresPage() {
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStructures() {
    setLoading(true);
    try {
      const data = await api.getStructures();
      setStructures(data);
    } catch (err: any) {
      setError(err.message || "Failed to load salary structures");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStructures();
    api.getEmployees().then(setEmployees).catch(() => {});
  }, []);

  const getEmployeeName = (empId: number) => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : `Employee #${empId}`;
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to soft-delete this salary structure?")) {
      return;
    }
    try {
      await api.deleteStructure(id);
      loadStructures(); // refresh list
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Salary Structures</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Create and maintain employee compensation schemes.
          </p>
        </div>
        <Link href="/structures/new" className="btn btnPrimary" style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--text-main)',
          padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Structure
        </Link>
      </header>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: 'var(--radius-sm)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          {loading ? (
            <p style={{ color: "var(--text-muted)", padding: "2rem 0", textAlign: "center" }}>
              Loading structures...
            </p>
          ) : structures.length === 0 ? (
            <p style={{ color: "var(--text-muted)", padding: "2rem 0", textAlign: "center" }}>
              No active salary structures found. Add a structure to begin.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>CTC (Annual)</th>
                  <th>Pay Frequency</th>
                  <th>Effective From</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {structures.map((struct) => (
                  <tr key={struct.id}>
                    <td>
                      <div>
                        <strong>{getEmployeeName(struct.employee_id)}</strong>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        ID: {struct.employee_id}
                      </span>
                    </td>
                    <td>
                      ₹{Number(struct.ctc).toLocaleString("en-IN", { minimumFractionDigits: 2 })} {struct.currency}
                    </td>
                    <td>{struct.pay_frequency}</td>
                    <td>{struct.effective_from}</td>
                    <td>
                      <span className={`${styles.badge} ${struct.is_active ? styles.active : styles.inactive}`}>
                        {struct.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
                        <Link href={`/structures/${struct.id}/edit`} className="btn btnSecondary" style={{
                          backgroundColor: 'var(--bg-hover)',
                          color: 'var(--text-main)',
                          padding: '0.4rem 0.8rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}>
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(struct.id)}
                          className="btn"
                          style={{
                            backgroundColor: 'var(--danger-bg)',
                            color: 'var(--danger-text)',
                            padding: '0.4rem 0.8rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            border: 'none'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
