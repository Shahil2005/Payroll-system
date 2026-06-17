"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  settingsApi,
  type Organization,
  type OrganizationUpdate,
  type PayslipSettings,
  type StatutoryConfig,
  type StatutoryConfigUpdate,
} from "@/utils/api";
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

type TabKey = "organisation" | "payslip" | "statutory";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "organisation", label: "Organisation", icon: "apartment" },
  { key: "payslip", label: "Payslip Template", icon: "receipt" },
  { key: "statutory", label: "Statutory Compliance", icon: "verified_user" },
];

// Build a fully-stringified FormState from an API payload, coercing any
// null/undefined fields to "" so the inputs stay controlled.
function toFormState(o: Partial<Record<OrgField, unknown>>): FormState {
  const next = { ...BLANK };
  (Object.keys(BLANK) as OrgField[]).forEach((k) => {
    const v = o[k];
    next[k] = v == null ? "" : String(v);
  });
  return next;
}

export default function SettingsPage() {
  const { can } = useAuth();
  const canEdit = can("users:manage");
  const [form, setForm] = useState<FormState>(BLANK);
  const [initial, setInitial] = useState<FormState>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabKey>("organisation");

  useEffect(() => {
    settingsApi
      .getOrganization()
      .then((o) => {
        const next = toFormState(o as Partial<Record<OrgField, unknown>>);
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
      // Coerce the response (which may contain nulls) back into string fields,
      // falling back to the submitted form for anything the API omits.
      const merged = toFormState({
        ...form,
        ...(updated as Partial<Record<OrgField, unknown>>),
      });
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

      {!canEdit && (
        <Banner tone="warn">
          You have read-only access. Only admins can edit these settings.
        </Banner>
      )}

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Organisation Profile */}
      <div className={tab === "organisation" ? "flex flex-col gap-6" : "hidden"}>
        {error && <Banner>{error}</Banner>}
        {saved && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Organisation profile saved.
          </div>
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

      {/* Payslip Template */}
      <div className={tab === "payslip" ? "" : "hidden"}>
        <PayslipTemplateSection canEdit={canEdit} />
      </div>

      {/* Statutory Compliance */}
      <div className={tab === "statutory" ? "" : "hidden"}>
        <StatutoryComplianceSection canEdit={canEdit} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statutory compliance — editable rates & thresholds applied to every payroll
// run, payslip and the live preview (PUT /settings/statutory). Rates are stored
// as fractions; this form edits them as percentages.
// ---------------------------------------------------------------------------
type RateKey =
  | "pf_employee_rate"
  | "pf_employer_rate"
  | "eps_rate"
  | "esi_employee_rate"
  | "esi_employer_rate";
type AmountKey =
  | "pf_wage_ceiling"
  | "eps_wage_ceiling"
  | "esi_wage_limit"
  | "tds_new_rebate_limit"
  | "tds_old_rebate_limit"
  | "tds_new_std_deduction"
  | "tds_old_std_deduction";

const STAT_GROUPS: {
  group: string;
  icon: string;
  rates: { key: RateKey; label: string; hint?: string }[];
  amounts: { key: AmountKey; label: string; hint?: string }[];
}[] = [
  {
    group: "Provident Fund (EPF)",
    icon: "savings",
    rates: [
      { key: "pf_employee_rate", label: "Employee rate %" },
      { key: "pf_employer_rate", label: "Employer rate %" },
      { key: "eps_rate", label: "EPS rate %", hint: "Pension share within the employer contribution." },
    ],
    amounts: [
      { key: "pf_wage_ceiling", label: "PF wage ceiling", hint: "Contributory wage is capped here when the structure caps PF." },
      { key: "eps_wage_ceiling", label: "EPS wage ceiling" },
    ],
  },
  {
    group: "ESI",
    icon: "health_and_safety",
    rates: [
      { key: "esi_employee_rate", label: "Employee rate %" },
      { key: "esi_employer_rate", label: "Employer rate %" },
    ],
    amounts: [{ key: "esi_wage_limit", label: "Wage limit", hint: "ESI applies only when monthly gross ≤ this." }],
  },
  {
    group: "Income Tax (TDS)",
    icon: "account_balance",
    rates: [],
    amounts: [
      { key: "tds_new_rebate_limit", label: "New regime — 87A rebate limit" },
      { key: "tds_new_std_deduction", label: "New regime — standard deduction" },
      { key: "tds_old_rebate_limit", label: "Old regime — 87A rebate limit" },
      { key: "tds_old_std_deduction", label: "Old regime — standard deduction" },
    ],
  },
];

const RATE_KEYS: RateKey[] = [
  "pf_employee_rate",
  "pf_employer_rate",
  "eps_rate",
  "esi_employee_rate",
  "esi_employer_rate",
];

// Round a fraction->percent (and back) without float noise like 8.3299999.
const toPct = (frac: number) => +(frac * 100).toFixed(4);

function StatutoryComplianceSection({ canEdit }: { canEdit: boolean }) {
  // Form holds display strings: rates as percentages, amounts as plain numbers.
  const [form, setForm] = useState<Record<RateKey | AmountKey, string>>(
    {} as Record<RateKey | AmountKey, string>
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function fromConfig(c: StatutoryConfig): Record<RateKey | AmountKey, string> {
    const out = {} as Record<RateKey | AmountKey, string>;
    (Object.keys(c) as (RateKey | AmountKey)[]).forEach((k) => {
      out[k] = RATE_KEYS.includes(k as RateKey)
        ? String(toPct(c[k] as number))
        : String(c[k]);
    });
    return out;
  }

  useEffect(() => {
    settingsApi
      .getStatutoryConfig()
      .then((c) => setForm(fromConfig(c)))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function set(key: RateKey | AmountKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    setSaving(true);
    try {
      const body = {} as StatutoryConfigUpdate;
      (Object.keys(form) as (RateKey | AmountKey)[]).forEach((k) => {
        const n = Number(form[k]);
        if (Number.isFinite(n)) {
          body[k] = RATE_KEYS.includes(k as RateKey) ? n / 100 : n;
        }
      });
      const updated = await settingsApi.updateStatutoryConfig(body);
      setForm(fromConfig(updated));
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Section
        icon="verified_user"
        title="Statutory Compliance"
        subtitle="Rates & thresholds applied to every payroll run, payslip and preview."
        wide
      >
        {err && <Banner>{err}</Banner>}
        {saved && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Statutory settings saved — applied across payroll.
          </div>
        )}

        <Banner tone="warn">
          These override the built-in statutory defaults for your company. Slab tables (Professional
          Tax by state, TDS income brackets) remain system-defined.
        </Banner>

        {STAT_GROUPS.map((g) => (
          <div key={g.group} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[var(--color-primary)]">{g.icon}</span>
              <span className="font-semibold">{g.group}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {g.rates.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canEdit}
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </Field>
              ))}
              {g.amounts.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input
                    className="input"
                    type="number"
                    step="1"
                    min="0"
                    disabled={!canEdit}
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}

        {canEdit && (
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} style={{ width: "auto" }} className="btn-primary px-6">
              {saving ? "Saving…" : "Save Statutory Settings"}
            </button>
          </div>
        )}
      </Section>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Payslip template — branding + section toggles applied to every payslip
// (PDF, email attachment and the web/print view). Self-contained: own load,
// state and save (PUT /settings/payslip).
// ---------------------------------------------------------------------------
const PAYSLIP_BLANK: PayslipSettings = {
  display_name: "",
  logo_url: "",
  accent_color: "",
  footer_note: "",
  show_employer_contributions: true,
  show_tax_block: true,
  show_attendance: true,
  use_doc_template: false,
  company_name: "",
  has_doc_template: false,
  doc_filename: null,
};

function PayslipTemplateSection({ canEdit }: { canEdit: boolean }) {
  const [ps, setPs] = useState<PayslipSettings>(PAYSLIP_BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function applySettings(s: PayslipSettings) {
    setPs({
      ...s,
      display_name: s.display_name ?? "",
      logo_url: s.logo_url ?? "",
      accent_color: s.accent_color ?? "",
      footer_note: s.footer_note ?? "",
    });
  }

  useEffect(() => {
    settingsApi
      .getPayslipSettings()
      .then(applySettings)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function uploadDoc(file: File) {
    setErr(null);
    setUploading(true);
    try {
      applySettings(await settingsApi.uploadPayslipDocument(file));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc() {
    setErr(null);
    setUploading(true);
    try {
      applySettings(await settingsApi.deletePayslipDocument());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function set<K extends keyof PayslipSettings>(key: K, value: PayslipSettings[K]) {
    setPs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    setSaving(true);
    try {
      applySettings(
        await settingsApi.updatePayslipSettings({
          display_name: ps.display_name || null,
          logo_url: ps.logo_url || null,
          accent_color: ps.accent_color || null,
          footer_note: ps.footer_note || null,
          show_employer_contributions: ps.show_employer_contributions,
          show_tax_block: ps.show_tax_block,
          show_attendance: ps.show_attendance,
          use_doc_template: ps.use_doc_template,
        })
      );
      setSaved(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  const accentPreview = ps.accent_color || "var(--color-primary)";

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Section
        icon="receipt"
        title="Payslip Template"
        subtitle="Branding and sections applied to every payslip (PDF, email & print)."
        wide
      >
        {err && <Banner>{err}</Banner>}
        {saved && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Payslip template saved.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display Name" hint={`Shown as the payslip header. Defaults to "${ps.company_name}".`}>
            <input
              className="input"
              placeholder={ps.company_name}
              disabled={!canEdit}
              value={ps.display_name ?? ""}
              onChange={(e) => set("display_name", e.target.value)}
            />
          </Field>
          <Field label="Accent Colour" hint="Hex like #2563eb. Used for headings & net pay.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                disabled={!canEdit}
                value={ps.accent_color || "#2563eb"}
                onChange={(e) => set("accent_color", e.target.value)}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
                aria-label="Accent colour"
              />
              <input
                className="input font-mono"
                placeholder="#2563eb"
                maxLength={7}
                disabled={!canEdit}
                value={ps.accent_color ?? ""}
                onChange={(e) => set("accent_color", e.target.value)}
              />
              <span className="h-9 w-9 shrink-0 rounded" style={{ background: accentPreview }} />
            </div>
          </Field>
        </div>

        <Field label="Logo URL" hint="Optional. A hosted image (https://…) shown in the payslip header.">
          <input
            className="input"
            type="url"
            placeholder="https://example.com/logo.png"
            disabled={!canEdit}
            value={ps.logo_url ?? ""}
            onChange={(e) => set("logo_url", e.target.value)}
          />
        </Field>

        <Field label="Footer Note" hint="Optional. Replaces the default 'system-generated' footer line.">
          <input
            className="input"
            maxLength={300}
            placeholder="This is a system-generated payslip and does not require a signature."
            disabled={!canEdit}
            value={ps.footer_note ?? ""}
            onChange={(e) => set("footer_note", e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="lbl">Sections</span>
          <PayslipToggle
            label="Employer Contributions"
            desc="Show the employer PF/ESI contributions block (informational)."
            disabled={!canEdit}
            checked={ps.show_employer_contributions}
            onChange={(v) => set("show_employer_contributions", v)}
          />
          <PayslipToggle
            label="Income Tax (TDS) details"
            desc="Show the TDS estimate breakdown (web/print view)."
            disabled={!canEdit}
            checked={ps.show_tax_block}
            onChange={(v) => set("show_tax_block", v)}
          />
          <PayslipToggle
            label="Attendance"
            desc="Show the working / LOP / paid days block."
            disabled={!canEdit}
            checked={ps.show_attendance}
            onChange={(v) => set("show_attendance", v)}
          />
        </div>

        {/* Uploaded Word (.docx) template */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--color-primary)]">description</span>
            <span className="font-semibold">Custom Word (.docx) template</span>
          </div>
          <p className="mb-2 text-xs text-[var(--color-muted)]">
            Upload a Word document with placeholder tokens; payslips are generated by filling it.
            <strong> Blank lines won&apos;t fill</strong> — you must use tokens. Common ones:{" "}
            <code>{"{{ company_name }}"}</code>, <code>{"{{ employee.name }}"}</code>,{" "}
            <code>{"{{ employee.code }}"}</code>, <code>{"{{ period_start }}"}</code>,{" "}
            <code>{"{{ gross }}"}</code>, <code>{"{{ total_deductions }}"}</code>,{" "}
            <code>{"{{ net }}"}</code>. For a specific row use{" "}
            <code>{"{{ amount.BASIC }}"}</code>, <code>{"{{ amount.HRA }}"}</code>,{" "}
            <code>{"{{ amount.PF }}"}</code>, <code>{"{{ amount.TDS }}"}</code> (by component code),
            or the whole list with <code>{"{{ earnings_lines }}"}</code> /{" "}
            <code>{"{{ deductions_lines }}"}</code>.
          </p>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            <strong>Tip:</strong> start from the sample below — typing tokens by hand in Word often
            splits them so they don&apos;t fill. Download it, restyle, and re-upload.{" "}
            <button
              type="button"
              onClick={() => settingsApi.downloadSampleTemplate()}
              className="font-semibold text-[var(--color-primary)] underline"
            >
              Download sample template
            </button>
          </p>

          {ps.has_doc_template ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2">
              <span className="material-symbols-outlined text-[20px] text-[var(--color-accent)]">check_circle</span>
              <span className="min-w-0 flex-1 truncate text-sm">{ps.doc_filename || "template.docx"}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={removeDoc}
                  disabled={uploading}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">No template uploaded — the built-in layout is used.</p>
          )}

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-3 py-2 text-sm font-semibold hover:bg-[var(--color-card)]">
                {uploading ? "Uploading…" : ps.has_doc_template ? "Replace file…" : "Upload .docx…"}
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDoc(f);
                    e.target.value = ""; // allow re-selecting the same file
                  }}
                />
              </label>
              {ps.has_doc_template && (
                <PayslipToggle
                  label="Use this document for payslips"
                  desc="Generate payslips from the uploaded template (PDF needs LibreOffice/Word on the server; otherwise the built-in PDF is used)."
                  disabled={!canEdit}
                  checked={ps.use_doc_template}
                  onChange={(v) => set("use_doc_template", v)}
                />
              )}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} style={{ width: "auto" }} className="btn-primary px-6">
              {saving ? "Saving…" : "Save Payslip Template"}
            </button>
          </div>
        )}
      </Section>
    </form>
  );
}

function PayslipToggle({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--color-muted)]">{desc}</span>
      </span>
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
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
