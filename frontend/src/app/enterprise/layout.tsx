"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { permissionForRoute } from "@/utils/auth";

const NAV: { label: string; icon: string; path: string }[] = [
  { label: "Dashboard", icon: "dashboard", path: "/enterprise/dashboard" },
  { label: "Payroll", icon: "payments", path: "/enterprise/payroll" },
  { label: "Salary Structures", icon: "tune", path: "/enterprise/payroll/structures" },
  { label: "Employees", icon: "groups", path: "/enterprise/employees" },
];

export default function EnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout, can } = useAuth();

  // Session guard: bounce unauthenticated users to the login screen.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--color-muted)]">
        Loading…
      </div>
    );
  }

  // Route-level permission guard: a user may be authenticated yet lack the
  // permission for this specific page (e.g. reached by typing the URL). The
  // sidebar already hides such links; this blocks direct navigation too.
  const requiredPerm = permissionForRoute(pathname);
  const routeAllowed = !requiredPerm || can(requiredPerm);

  const isActive = (path: string) =>
    path === "/enterprise/payroll"
      ? pathname === path || (pathname.startsWith(path) && !pathname.includes("/structures"))
      : pathname.startsWith(path);

  const initials =
    user.full_name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || user.email[0]?.toUpperCase() || "?";

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5 no-print">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="material-symbols-outlined text-[var(--color-primary)]">payments</span>
          <span className="text-xl font-bold tracking-tight">Croar</span>
          <span className="rounded bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
            Payroll
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.filter((item) => {
            const perm = permissionForRoute(item.path);
            return !perm || can(perm);
          }).map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--color-border)] pt-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-purple-400 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{user.full_name || user.email}</span>
              <span className="text-xs text-[var(--color-dim)]">{user.role}</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1 bg-[var(--color-bg)] p-8 print:ml-0 print:p-0">
        {routeAllowed ? (
          children
        ) : (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <span className="material-symbols-outlined text-5xl text-[var(--color-dim)]">lock</span>
            <h2 className="text-xl font-bold">Access denied</h2>
            <p className="max-w-sm text-sm text-[var(--color-muted)]">
              You don&apos;t have permission to view this page. Contact an administrator if you
              believe this is a mistake.
            </p>
            <Link
              href="/enterprise/dashboard"
              className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
