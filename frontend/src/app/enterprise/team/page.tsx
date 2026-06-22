"use client";

import { useEffect, useState } from "react";
import { authApi, payrollApi, type Employee, type UserRole } from "@/utils/api";
import type { AuthUser } from "@/utils/auth";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "ADMIN", label: "Admin", hint: "Full access, including managing users" },
  { value: "HR", label: "HR", hint: "Full payroll lifecycle, no user management" },
  { value: "VIEWER", label: "Viewer", hint: "Read-only access to payroll data" },
  { value: "EMPLOYEE", label: "Employee", hint: "Self-service: sees only their own records" },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  HR: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  VIEWER: "bg-[var(--color-hover)] text-[var(--color-muted)]",
  EMPLOYEE: "bg-[var(--color-hover)] text-[var(--color-muted)]",
};

const EMPTY = { email: "", full_name: "", password: "", role: "VIEWER" as UserRole, employee_id: "" };

export default function TeamPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Employees already tied to a login — excluded from the picker (one login each).
  const linkedEmployeeIds = new Set(
    users.map((u) => u.employee_id).filter(Boolean) as string[]
  );
  const linkableEmployees = employees.filter((e) => !linkedEmployeeIds.has(e.id));

  async function load() {
    setLoading(true);
    try {
      const [u, emps] = await Promise.all([
        authApi.listUsers(),
        payrollApi.listEmployees(),
      ]);
      setUsers(u);
      setEmployees(emps);
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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSaving(true);
    try {
      await authApi.createUser({
        email: form.email,
        full_name: form.full_name,
        password: form.password,
        role: form.role,
        employee_id: form.role === "EMPLOYEE" ? form.employee_id || null : null,
      });
      setOpen(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const initials = (u: AuthUser) =>
    u.full_name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    u.email[0]?.toUpperCase() ||
    "?";

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Manage the users who can sign in to your organization.
          </p>
        </div>
        <button
          onClick={() => {
            setFormErr(null);
            setForm(EMPTY);
            setOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          Add User
        </button>
      </header>

      {error && <Banner>{error}</Banner>}

      {loading ? (
        <p className="p-8 text-center text-[var(--color-muted)]">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-400 text-xs font-bold text-white">
                        {initials(u)}
                      </div>
                      <span className="font-semibold">
                        {u.full_name || "—"}
                        {me?.id === u.id && (
                          <span className="ml-2 text-xs font-normal text-[var(--color-dim)]">(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-muted)]">{u.email}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                        ROLE_BADGE[u.role] ?? "bg-[var(--color-hover)] text-[var(--color-muted)]"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--color-muted)]">
                    {u.is_active ? "Active" : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Add User" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="flex flex-col gap-4">
            {formErr && <Banner>{formErr}</Banner>}
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Full Name</span>
              <input
                className="input"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Email</span>
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Temporary Password</span>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <span className="text-xs text-[var(--color-dim)]">
                At least 6 characters. Share it with the user to sign in.
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Role</span>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole, employee_id: "" })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </label>

            {form.role === "EMPLOYEE" && (
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Linked Employee</span>
                <select
                  className="input"
                  required
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                >
                  <option value="" disabled>
                    Select an employee…
                  </option>
                  {linkableEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {`${e.first_name} ${e.last_name}`.trim() || e.employee_id || e.id}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--color-dim)]">
                  This login will only see this employee&apos;s own records.
                  {linkableEmployees.length === 0 && " All employees already have a login."}
                </span>
              </label>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Adding…" : "Add User"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
