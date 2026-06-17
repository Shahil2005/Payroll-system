"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [initial, setInitial] = useState<FormState>(BLANK);
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
        setInitial(next);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  );

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
      const merged = { ...form, ...(updated as unknown as Partial<FormState>) };
      setForm(merged);
      setInitial(merged);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;

  const initials = (form.name || "?").trim().charAt(0).toUpperCase() || "?";
  const locality = [form.city, form.state].filter(Boolean).join(", ");

  return (
    <div className="animate-fade-in flex w-full flex-col gap-6 pb-24">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-dim)]">
        Settings
      </p>

      {/* Organisation hero */}
      <div className="flex items-center gap-5 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-card)] to-[var(--color-surface)] p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-2xl font-bold text-white shadow-lg shadow-[var(--color-primary)]/20">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">
            {form.name || "Your Organisation"}
          </h1>
          <p className="truncate text-sm text-[var(--color-muted)]">
            {form.legal_name || "Complete your organisation profile below."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {form.industry && <Chip icon="business_center">{form.industry}</Chip>}
            {locality && <Chip icon="location_on">{locality}</Chip>}
            <Chip icon="payments">{form.currency}</Chip>
            {form.pan && <Chip icon="badge">PAN {form.pan}</Chip>}
          </div>
        </div>
      </div>

      {error && <Banner>{error}</Banner>}
      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          Organisation profile saved.
        </div>
      )}
      {!canEdit && (
        <Banner tone="warn">
          You have read-only access. Only admins can edit these settings.
        </Banner>
      )}

      <form onSubmit={save} className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Section
          icon="apartment"
          title="Basic Details"
          subtitle="Your organisation's identity."
        >
          <Field label="Organisation Name" required>
            <input
              className="input"
              required
              placeholder="Acme Technologies"
              disabled={!canEdit}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Legal Name" hint="As registered with the authorities.">
            <input
              className="input"
              placeholder="Acme Technologies Pvt Ltd"
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

        <Section
          icon="contact_mail"
          title="Contact"
          subtitle="How people reach your organisation."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact Email">
              <input
                className="input"
                type="email"
                placeholder="hello@acme.com"
                disabled={!canEdit}
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </Field>
            <Field label="Contact Phone">
              <input
                className="input"
                placeholder="+91 98765 43210"
                disabled={!canEdit}
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section
          icon="location_on"
          title="Address"
          subtitle="Registered / business address."
          wide
        >
          <Field label="Address Line 1">
            <input
              className="input"
              placeholder="Building, street"
              disabled={!canEdit}
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
            />
          </Field>
          <Field label="Address Line 2">
            <input
              className="input"
              placeholder="Area, landmark"
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
              <input className="input" inputMode="numeric" disabled={!canEdit} value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </Field>
            <Field label="Country">
              <input className="input" disabled={!canEdit} value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section
          icon="receipt_long"
          title="Tax Information"
          subtitle="Organisation-level statutory identifiers."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="PAN" hint="10-character permanent account number.">
              <input
                className="input font-mono uppercase tracking-wider"
                maxLength={10}
                placeholder="AAAAA9999A"
                disabled={!canEdit}
                value={form.pan}
                onChange={(e) => set("pan", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="TAN" hint="Tax deduction account number.">
              <input
                className="input font-mono uppercase tracking-wider"
                maxLength={10}
                placeholder="AAAA99999A"
                disabled={!canEdit}
                value={form.tan}
                onChange={(e) => set("tan", e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </Section>

        {/* More settings — surface adjacent admin areas. */}
        <Section
          icon="tune"
          title="More Settings"
          subtitle="Other parts of your workspace."
          wide
        >
          <Link
            href="/enterprise/team"
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] px-4 py-3 transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-hover)]"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
              </span>
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

        {/* Sticky save bar */}
        {canEdit && (
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/90 px-5 py-3 shadow-xl backdrop-blur xl:col-span-2">
            <span className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span
                className={`h-2 w-2 rounded-full ${dirty ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]"}`}
              />
              {dirty ? "You have unsaved changes" : "All changes saved"}
            </span>
            <button
              type="submit"
              disabled={saving || !dirty}
              style={{ width: "auto" }}
              className="btn-primary px-6"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="chip">
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {children}
    </span>
  );
}

function Section({
  icon,
  title,
  subtitle,
  wide,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 ${
        wide ? "xl:col-span-2" : ""
      }`}
    >
      <div className="mb-5 flex items-center gap-3 border-b border-[var(--color-border)] pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--color-muted)]">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="lbl">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--color-muted)]">{hint}</span>}
    </label>
  );
}
