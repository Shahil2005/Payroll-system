"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSelfServiceUser } from "@/utils/auth";

const NAV = [
  { label: "Dashboard", icon: "dashboard", path: "/employee/dashboard" },
  { label: "Timesheets", icon: "schedule", path: "/employee/timesheets" },
  { label: "Leave", icon: "event_available", path: "/employee/leave" },
  { label: "Payslips", icon: "receipt_long", path: "/employee/payslips" },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  // Guard: unauthenticated -> login; non-self-service (admin/HR/viewer) ->
  // the enterprise app (this area is only for linked employees).
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!isSelfServiceUser(user)) router.replace("/enterprise/dashboard");
  }, [loading, user, router]);

  if (loading || !user || !isSelfServiceUser(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--color-muted)]">
        Loading…
      </div>
    );
  }

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
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="material-symbols-outlined text-[var(--color-primary)]">payments</span>
          <span className="text-xl font-bold tracking-tight">Croar</span>
          <span className="rounded bg-[var(--color-primary)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
            My Workspace
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.path);
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
              <span className="text-xs text-[var(--color-dim)]">Employee</span>
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

      <main className="ml-64 flex-1 bg-[var(--color-bg)] p-8">{children}</main>
    </div>
  );
}
