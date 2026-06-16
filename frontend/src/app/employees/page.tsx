"use client";

import React, { useEffect, useState } from "react";
import { api, Employee } from "@/lib/api";
import styles from "./employees.module.css";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function loadEmployees() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEmployees();
      setEmployees(data);
    } catch (err: any) {
      setError(err.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  function getInitials(first: string, last: string) {
    return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  }

  function resetForm() {
    setFirstName(""); setLastName("");
    setUsername(""); setEmail(""); setPassword("");
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.createEmployee({
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        password,
      });
      setShowModal(false);
      resetForm();
      loadEmployees();
    } catch (err: any) {
      setFormError(err.message || "Failed to add employee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Employees</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Manage your workforce. Add employees to assign salary structures.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className={styles.btnPrimary}
          style={{ flex: "none", width: "auto", padding: "0.75rem 1.25rem", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
      </header>

      {error && (
        <div style={{ padding: "1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>Loading employees...</p>
      ) : employees.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h3 style={{ marginBottom: "0.5rem" }}>No Employees Found</h3>
            <p style={{ fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Add your first employee to start assigning salary structures and running payroll.
            </p>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className={styles.btnPrimary}
              style={{ width: "auto", margin: "0 auto", padding: "0.75rem 1.5rem", display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
            >
              Add First Employee
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {employees.map((emp) => (
            <div key={emp.id} className={styles.empCard}>
              <div className={styles.avatar}>
                {getInitials(emp.first_name, emp.last_name)}
              </div>
              <div className={styles.empInfo}>
                <span className={styles.empName}>{emp.first_name} {emp.last_name}</span>
                <span className={styles.empEmail}>{emp.email}</span>
                <span className={styles.empUsername}>@{emp.username} · ID: {emp.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Add New Employee</h2>

            {formError && (
              <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>First Name</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    minLength={1}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Last Name</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    minLength={1}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Username</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="john_doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email Address</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="john.doe@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Password</label>
                <input
                  type="password"
                  className={styles.input}
                  placeholder="Min. 4 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                />
              </div>

              <div className={styles.btnRow}>
                <button type="submit" disabled={saving} className={styles.btnPrimary}>
                  {saving ? "Adding..." : "Add Employee"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className={styles.btnSecondary}
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
