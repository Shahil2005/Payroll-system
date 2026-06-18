"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  payrollApi,
  settingsApi,
  inr,
  type Employee,
  type PayrollCycle,
  type Payslip,
  type PayslipSettings,
} from "@/utils/api";
import { Banner, PayslipBadge } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";

export default function PayslipDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tpl, setTpl] = useState<PayslipSettings | null>(null);
  // HTML rendered from the company's uploaded template, when one is enabled.
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setNotice(null);
    try {
      await payrollApi.downloadPayslipPdf(id);
    } catch (err) {
      setNotice({ tone: "err", msg: (err as Error).message });
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadDoc() {
    setDownloadingDoc(true);
    setNotice(null);
    try {
      await payrollApi.downloadPayslipDocx(id);
    } catch (err) {
      setNotice({ tone: "err", msg: (err as Error).message });
    } finally {
      setDownloadingDoc(false);
    }
  }

  async function handleEmail() {
    setEmailing(true);
    setNotice(null);
    try {
      const res = await payrollApi.emailPayslip(id);
      setNotice({ tone: "ok", msg: `Payslip emailed to ${res.to}.` });
    } catch (err) {
      setNotice({ tone: "err", msg: (err as Error).message });
    } finally {
      setEmailing(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await payrollApi.getPayslip(id);
        setSlip(p);
        const [c, emps, settings] = await Promise.all([
          payrollApi.getCycle(p.cycle_id),
          payrollApi.listEmployees(),
          settingsApi.getPayslipSettings().catch(() => null),
        ]);
        setCycle(c);
        setEmployee(emps.find((e) => e.id === p.employee_id) ?? null);
        setTpl(settings);
        // If a custom template is enabled, render the payslip from it.
        if (settings?.use_doc_template && settings?.has_doc_template) {
          const preview = await payrollApi
            .getPayslipPreviewHtml(id)
            .catch(() => null);
          setTemplateHtml(preview?.html ?? null);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <p className="p-12 text-center text-[var(--color-muted)]">Loading…</p>;
  if (error) return <div className="p-6"><Banner>{error}</Banner></div>;
  if (!slip || !cycle) return <p className="p-12 text-center text-[var(--color-muted)]">Payslip not found.</p>;

  const companyName = tpl?.display_name || tpl?.company_name || "Company";
  const accent = tpl?.accent_color || undefined;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link href={`/enterprise/payroll/${slip.cycle_id}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)]">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Cycle
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
          {tpl?.has_doc_template && (
            <button
              onClick={handleDownloadDoc}
              disabled={downloadingDoc}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">description</span>
              {downloadingDoc ? "Preparing…" : "Download as Word"}
            </button>
          )}
          {can("payroll:pay") && (
            <button
              onClick={handleEmail}
              disabled={emailing}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">mail</span>
              {emailing ? "Sending…" : "Email to Employee"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            <span className="material-symbols-outlined text-[18px]">print</span> Print
          </button>
        </div>
      </header>

      {notice && (
        <div className="no-print">
          {notice.tone === "ok" ? (
            <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
              {notice.msg}
            </div>
          ) : (
            <Banner>{notice.msg}</Banner>
          )}
        </div>
      )}

      {templateHtml ? (
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-white p-8 text-black print:border-0 print:p-0">
          {/* Rendered from the company's uploaded payslip template. */}
          <div
            className="payslip-template"
            dangerouslySetInnerHTML={{ __html: templateHtml }}
          />
          <style>{`
            .payslip-template table { width: 100%; border-collapse: collapse; margin: 6px 0; }
            .payslip-template td, .payslip-template th { border: 1px solid #d1d5db; padding: 4px 8px; vertical-align: top; }
            .payslip-template p { margin: 4px 0; }
          `}</style>
        </div>
      ) : (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 print:border-0">
        <div className="mb-6 flex items-start justify-between border-b border-[var(--color-border)] pb-5">
          <div className="flex flex-col gap-1.5">
            {tpl?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tpl.logo_url} alt={companyName} className="max-h-12 w-auto object-contain" />
            )}
            <div className="text-2xl font-extrabold tracking-tight">{companyName}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold" style={accent ? { color: accent } : undefined}>
              PAYSLIP
            </div>
            <div className="text-xs text-[var(--color-muted)]">Ref #{slip.id.slice(0, 8)}</div>
            <div className="mt-1"><PayslipBadge status={slip.status} /></div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:grid-cols-4">
          <Info label="Employee" value={employee ? `${employee.first_name} ${employee.last_name}` : slip.employee_id.slice(0, 8)} />
          <Info label="Email" value={employee?.email ?? "—"} />
          <Info label="Period" value={`${cycle.period_start} → ${cycle.period_end}`} />
          <Info label="Pay Date" value={cycle.pay_date} />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Breakdown title="Earnings" lines={slip.earnings ?? []} currency={slip.currency} total={Number(slip.gross_earnings)} totalLabel="Gross Earnings" />
          <Breakdown title="Deductions" lines={slip.deductions ?? []} currency={slip.currency} total={Number(slip.total_deductions)} totalLabel="Total Deductions" negative />
        </div>

        {tpl?.show_employer_contributions !== false && slip.employer_contributions && slip.employer_contributions.length > 0 && (
          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <Breakdown
              title="Employer Contributions (not deducted)"
              lines={slip.employer_contributions}
              currency={slip.currency}
              total={slip.employer_contributions.reduce((sum, l) => sum + Number(l.amount), 0)}
              totalLabel="Total Employer Cost"
            />
          </div>
        )}

        {tpl?.show_attendance !== false && (
          <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center text-sm">
            <Info label="Working Days" value={String(DEFAULT_WD)} center />
            <Info label="LOP Days" value={String(Number(slip.lop_days))} center />
            <Info label="Paid Days" value={String(Number(slip.paid_days ?? 0))} center />
          </div>
        )}

        {(() => {
          const tds = (slip.statutory as Record<string, unknown> | null)?.tds as
            | Record<string, number | string>
            | undefined;
          if (!tds || tpl?.show_tax_block === false) return null;
          return (
            <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-bold">Income Tax (TDS) — estimate</h4>
                <span className="text-xs text-[var(--color-muted)]">
                  {tds.regime} regime · {String(tds.version)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <TaxRow label="Projected annual income" value={inr(tds.total_income, slip.currency)} />
                <TaxRow label="Taxable income" value={inr(tds.taxable_income, slip.currency)} />
                <TaxRow label="Estimated annual tax" value={inr(tds.annual_tax, slip.currency)} />
                <TaxRow label="Monthly TDS" value={inr(tds.monthly_tds, slip.currency)} />
              </div>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Estimate only — not a tax certificate. HRA exemption and surcharge are not modelled.
              </p>
            </div>
          );
        })()}

        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-5">
          <span className="text-sm text-[var(--color-muted)]">Net Payable</span>
          <span
            className="text-3xl font-extrabold text-[var(--color-accent)]"
            style={accent ? { color: accent } : undefined}
          >
            {inr(slip.net_pay, slip.currency)}
          </span>
        </div>

        {tpl?.footer_note && (
          <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-center text-xs text-[var(--color-muted)]">
            {tpl.footer_note}
          </p>
        )}
      </div>
      )}
    </div>
  );
}

const DEFAULT_WD = 30;

function TaxRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Info({ label, value, center = false }: { label: string; value: string; center?: boolean }) {
  return (
    <div className={`min-w-0 ${center ? "text-center" : ""}`}>
      <div className="text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="font-medium wrap-anywhere">{value}</div>
    </div>
  );
}

function Breakdown({
  title,
  lines,
  currency,
  total,
  totalLabel,
  negative = false,
}: {
  title: string;
  lines: { code: string; label: string; amount: number }[];
  currency: string;
  total: number;
  totalLabel: string;
  negative?: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2 border-b border-[var(--color-border)] pb-2 font-bold">{title}</h4>
      <div className="min-h-24">
        {lines.length === 0 ? (
          <p className="py-2 text-sm text-[var(--color-muted)]">None</p>
        ) : (
          lines.map((l) => (
            <div key={l.code} className="flex justify-between py-1.5 text-sm">
              <span>{l.label}</span>
              <span className="font-medium">
                {negative ? "- " : ""}
                {inr(l.amount, currency)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 font-bold">
        <span>{totalLabel}</span>
        <span className={negative ? "text-[var(--color-danger)]" : ""}>
          {negative ? "- " : ""}
          {inr(total, currency)}
        </span>
      </div>
    </div>
  );
}
