"use client";

import { useEffect, useState } from "react";
import { payrollApi, inr, PT_STATES, type Employee, type SalaryStructure } from "@/utils/api";
import { Banner, Modal } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useDialog } from "@/components/DialogProvider";

const STATE_LABEL: Record<string, string> = Object.fromEntries(
  PT_STATES.map((s) => [s.code, s.label])
);
const stateLabel = (code: string | null) => (code ? STATE_LABEL[code] ?? code : null);

export default function EmployeesPage() {
  const { can } = useAuth();
  const { confirm } = useDialog();
  const canEdit = can("payroll:configure");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Employee detail view (opened by clicking a card).
  const [detail, setDetail] = useState<Employee | null>(null);
  const [detailStruct, setDetailStruct] = useState<SalaryStructure | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function openDetail(emp: Employee) {
    setDetail(emp);
    setDetailStruct(null);
    setDetailLoading(true);
    payrollApi
      .listStructures(emp.id)
      .then((list) => setDetailStruct(list.find((s) => s.is_active) ?? list[0] ?? null))
      .catch(() => setDetailStruct(null))
      .finally(() => setDetailLoading(false));
  }
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    employee_id: "",
    pan: "",
    uan: "",
    esic_number: "",
    state: "",
    date_of_joining: "",
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
        pan: form.pan || null,
        uan: form.uan || null,
        esic_number: form.esic_number || null,
        state: form.state || null,
        date_of_joining: form.date_of_joining || null,
      });
      setOpen(false);
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        employee_id: "",
        pan: "",
        uan: "",
        esic_number: "",
        state: "",
        date_of_joining: "",
      });
      await load();
    } catch (err) {
      setFormErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(emp: Employee) {
    const ok = await confirm({
      title: "Remove employee",
      message: `Remove ${emp.first_name} ${emp.last_name}? Their salary structure is removed too.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
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
            <div
              key={e.id}
              onClick={() => openDetail(e)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  openDetail(e);
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]/40"
            >
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
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(e);
                  }}
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

            <div className="mt-1 border-t border-[var(--color-border)] pt-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Statutory details (for PF / ESI / Professional Tax)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">PAN</span>
                  <input
                    className="input uppercase"
                    maxLength={10}
                    value={form.pan}
                    onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">State (PT)</span>
                  <select
                    className="input"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  >
                    <option value="">— Select —</option>
                    {PT_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label} ({s.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">UAN (PF)</span>
                  <input className="input" maxLength={20} value={form.uan} onChange={(e) => setForm({ ...form, uan: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">ESIC Number</span>
                  <input className="input" maxLength={20} value={form.esic_number} onChange={(e) => setForm({ ...form, esic_number: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="lbl">Date of Joining</span>
                  <input className="input" type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
                </label>
              </div>
            </div>

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

      {detail && (
        <Modal title="Employee Details" onClose={() => setDetail(null)}>
          <div className="flex flex-col gap-6">
            {/* Identity header */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-purple-400 text-2xl font-bold text-white">
                {initials(detail)}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold">
                  {detail.first_name} {detail.last_name}
                </div>
                <div className="truncate text-sm text-[var(--color-muted)]">{detail.email}</div>
                {detail.employee_id && (
                  <span className="mt-1 inline-block rounded bg-[var(--color-hover)] px-2 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                    {detail.employee_id}
                  </span>
                )}
              </div>
            </div>

            {/* Statutory / profile fields */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Statutory & Profile
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <DetailRow label="PAN" value={detail.pan} mono />
                <DetailRow label="State (PT)" value={stateLabel(detail.state)} />
                <DetailRow label="UAN (PF)" value={detail.uan} mono />
                <DetailRow label="ESIC Number" value={detail.esic_number} mono />
                <DetailRow label="Date of Joining" value={detail.date_of_joining} />
                <DetailRow
                  label="Added On"
                  value={detail.created_at ? new Date(detail.created_at).toLocaleDateString() : null}
                />
              </div>
            </div>

            {/* Active salary structure */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Salary Structure
              </p>
              {detailLoading ? (
                <p className="text-sm text-[var(--color-muted)]">Loading…</p>
              ) : !detailStruct ? (
                <p className="text-sm text-[var(--color-muted)]">
                  No active salary structure for this employee.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <DetailRow label="Annual CTC" value={inr(detailStruct.ctc, detailStruct.currency)} />
                    <DetailRow label="Pay Frequency" value={detailStruct.pay_frequency} />
                    <DetailRow label="Effective From" value={detailStruct.effective_from} />
                    <DetailRow label="LOP Days" value={String(detailStruct.lop_days ?? 0)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
                    {detailStruct.pf_enabled && <StatChip>EPF</StatChip>}
                    {detailStruct.esi_enabled && <StatChip>ESI</StatChip>}
                    {detailStruct.pt_enabled && <StatChip>PT</StatChip>}
                    {detailStruct.tds_enabled && <StatChip>TDS</StatChip>}
                    {!detailStruct.pf_enabled &&
                      !detailStruct.esi_enabled &&
                      !detailStruct.pt_enabled &&
                      !detailStruct.tds_enabled && (
                        <span className="text-xs text-[var(--color-dim)]">No statutory components enabled</span>
                      )}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const emp = detail;
                    setDetail(null);
                    if (emp) remove(emp);
                  }}
                  className="rounded-lg border border-[var(--color-danger)]/40 px-4 py-2 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                >
                  Remove
                </button>
              )}
              <button type="button" onClick={() => setDetail(null)} className="btn-ghost px-6">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono" : ""} ${value ? "" : "text-[var(--color-dim)]"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function StatChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
      {children}
    </span>
  );
}
