"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { settingsApi, type Organization, type OrganizationUpdate } from "@/utils/api";
import { Banner } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

const INDUSTRIES = [
  "Information Technology",
  "Financial Services",
  "Manufacturing",
  "Construction",
  "Education",
  "Healthcare",
  "Retail",
  "Hospitality",
  "Logistics",
  "Automotive",
  "Media & Entertainment",
  "Consulting",
  "Other",
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

// All form values are kept as strings (nulls from the API are coerced to "").
type OrgField =
  | "name"
  | "currency"
  | "legal_name"
  | "industry"
  | "contact_email"
  | "contact_phone"
  | "address_line1"
  | "address_line2"
  | "city"
  | "state"
  | "pincode"
  | "country"
  | "pan"
  | "tan";
type FormState = Record<OrgField, string>;

const BLANK: FormState = {
  name: "",
  currency: "INR",
  legal_name: "",
  industry: "",
  contact_email: "",
  contact_phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  pan: "",
  tan: "",
};

export default function SettingsPage() {
  const { can } = useAuth();
  const canEdit = can("users:manage");
  const [form, setForm] = useState<FormState>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsApi
      .getOrganization()
      .then((o) => {
        // Coerce nulls to "" so inputs stay controlled.
        const next = { ...BLANK };
        (Object.keys(BLANK) as (keyof FormState)[]).forEach((k) => {
          const v = o[k];
          (next[k] as string) = v == null ? "" : String(v);
        });
        setForm(next);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await settingsApi.updateOrganization(form as OrganizationUpdate);
      setForm({ ...form, ...(updated as unknown as Partial<FormState>) });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;

  return (
    <div className="animate-fade-in mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Manage your organisation profile and workspace.
        </p>
      </header>

      {error && <Banner>{error}</Banner>}
      {saved && (
        <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
          Organisation profile saved.
        </div>
      )}
      {!canEdit && (
        <Banner tone="warn">You have read-only access. Only admins can edit these settings.</Banner>
      )}

      <form onSubmit={save} className="flex flex-col gap-6">
        <Section title="Basic Details" subtitle="Your organisation's identity.">
          <Field label="Organisation Name" required>
            <input
              className="input"
              required
              disabled={!canEdit}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Legal Name">
            <input
              className="input"
              disabled={!canEdit}
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Industry">
              <select
                className="input"
                disabled={!canEdit}
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
              >
                <option value="">— Select —</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select
                className="input"
                disabled={!canEdit}
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Contact" subtitle="How people reach your organisation.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact Email">
              <input
                className="input"
                type="email"
                disabled={!canEdit}
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </Field>
            <Field label="Contact Phone">
              <input
                className="input"
                disabled={!canEdit}
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Address" subtitle="Registered / business address.">
          <Field label="Address Line 1">
            <input
              className="input"
              disabled={!canEdit}
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
            />
          </Field>
          <Field label="Address Line 2">
            <input
              className="input"
              disabled={!canEdit}
              value={form.address_line2}
              onChange={(e) => set("address_line2", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="City">
              <input className="input" disabled={!canEdit} value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State">
              <input className="input" disabled={!canEdit} value={form.state} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="Pincode">
              <input className="input" disabled={!canEdit} value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </Field>
            <Field label="Country">
              <input className="input" disabled={!canEdit} value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Tax Information" subtitle="Organisation-level statutory identifiers.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="PAN">
              <input
                className="input uppercase"
                maxLength={10}
                disabled={!canEdit}
                value={form.pan}
                onChange={(e) => set("pan", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="TAN">
              <input
                className="input uppercase"
                maxLength={10}
                disabled={!canEdit}
                value={form.tan}
                onChange={(e) => set("tan", e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </Section>

        {canEdit && (
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary px-6">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </form>

      {/* More settings — surface adjacent admin areas. */}
      <Section title="More Settings" subtitle="Other parts of your workspace.">
        <Link
          href="/enterprise/team"
          className="flex items-center justify-between rounded-xl border border-[var(--color-border)] px-4 py-3 hover:bg-[var(--color-hover)]"
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[var(--color-primary)]">manage_accounts</span>
            <span>
              <span className="block font-semibold">Users &amp; Roles</span>
              <span className="block text-xs text-[var(--color-muted)]">
                Invite teammates and assign Admin / HR / Viewer roles.
              </span>
            </span>
          </span>
          <span className="material-symbols-outlined text-[var(--color-dim)]">chevron_right</span>
        </Link>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="mb-4 border-b border-[var(--color-border)] pb-3">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--color-muted)]">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="lbl">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {children}
    </label>
  );
}
