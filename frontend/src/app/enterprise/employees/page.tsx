"use client";

import { useEffect, useState } from "react";
import { payrollApi, type Employee } from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

export default function EmployeesPage() {
  const { can } = useAuth();
  const canEdit = can("payroll:configure");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    employee_id: "",
  });

  async function load() {
    setLoading(true);
    try {
      setEmployees(await payrollApi.listEmployees());
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
      await payrollApi.createEmployee({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        employee_id: form.employee_id || null,
      });
      setOpen(false);
      setForm({ first_name: "", last_name: "", email: "", employee_id: "" });
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(emp: Employee) {
    if (!confirm(`Remove ${emp.first_name} ${emp.last_name}? Their salary structure is removed too.`)) return;
    setError(null);
    setDeletingId(emp.id);
    try {
      await payrollApi.deleteEmployee(emp.id);
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const initials = (e: Employee) =>
    `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Employees</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Manage your workforce. Add employees to assign salary structures.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setFormErr(null);
              setOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            Add Employee
          </button>
        )}
      </header>

      {error && <Banner>{error}</Banner>}

      {loading ? (
        <p className="p-8 text-center text-[var(--color-muted)]">Loading…</p>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-dim)]">groups</span>
          <p className="text-[var(--color-muted)]">No employees yet. Add your first employee.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-400 font-bold text-white">
                {initials(e)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {e.first_name} {e.last_name}
                </div>
                <div className="truncate text-xs text-[var(--color-muted)]">{e.email}</div>
                {e.employee_id && (
                  <div className="truncate font-mono text-xs text-[var(--color-dim)]">{e.employee_id}</div>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(e)}
                  disabled={deletingId === e.id}
                  title="Remove employee"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-dim)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {deletingId === e.id ? "hourglass_empty" : "delete"}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Add Employee" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="flex flex-col gap-4">
            {formErr && <Banner>{formErr}</Banner>}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="lbl">First Name</span>
                <input className="input" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="lbl">Last Name</span>
                <input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Email</span>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="lbl">Employee Code (optional)</span>
              <input className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Adding…" : "Add Employee"}
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
