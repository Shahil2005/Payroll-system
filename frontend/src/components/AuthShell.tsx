import Link from "next/link";

const HIGHLIGHTS = [
  {
    icon: "bolt",
    title: "Run payroll in minutes",
    body: "Automated statutory deductions, TDS estimates and payslips — built for Indian compliance.",
  },
  {
    icon: "shield_person",
    title: "Role-based access & audit",
    body: "Granular permissions, maker-checker approvals and an append-only audit trail.",
  },
  {
    icon: "insights",
    title: "Reports you can trust",
    body: "Salary registers, payroll summaries and reconciliations exportable to CSV & PDF.",
  },
];

/**
 * Two-column auth layout: a branded marketing panel (hidden on small
 * screens) alongside the page-specific form. Shared by /login and /signup
 * so the two screens stay visually identical.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand / marketing panel */}
      <aside className="relative hidden overflow-hidden bg-[var(--color-surface)] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Decorative gradient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[var(--color-primary)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[var(--color-accent)] opacity-10 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <span className="material-symbols-outlined text-[22px]">payments</span>
          </span>
          <span className="text-lg font-bold tracking-tight">Croar Payroll</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Payroll, compliance and people — in one place.
          </h2>
          <p className="mt-4 text-[var(--color-muted)]">
            The modern payroll platform for growing Indian businesses.
          </p>

          <ul className="mt-10 flex flex-col gap-6">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-primary)]">
                  <span className="material-symbols-outlined text-[20px]">{h.icon}</span>
                </span>
                <div>
                  <p className="font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{h.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[var(--color-dim)]">
          © {new Date().getFullYear()} Croar Payroll. All rights reserved.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 py-12">
        <div className="animate-fade-in w-full max-w-sm">
          {/* Compact logo for small screens where the brand panel is hidden */}
          <Link
            href="/"
            className="mb-8 flex items-center justify-center gap-2.5 lg:hidden"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </span>
            <span className="text-lg font-bold tracking-tight">Croar Payroll</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
