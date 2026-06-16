"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Banner } from "@/components/ui";

const DEMO = [
  { label: "Admin", email: "admin@croar.com", password: "admin123" },
  { label: "HR", email: "hr@croar.com", password: "hr123" },
  { label: "Viewer", email: "viewer@croar.com", password: "viewer123" },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> skip the login screen.
  useEffect(() => {
    if (!loading && user) router.replace("/enterprise/payroll");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/enterprise/payroll");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="animate-fade-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-primary)]">
            payments
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Croar Payroll</h1>
          <p className="text-sm text-[var(--color-muted)]">Sign in to continue</p>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-7"
        >
          {error && <Banner>{error}</Banner>}
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Demo accounts
          </p>
          <div className="flex flex-col gap-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
              >
                <span className="font-medium">{d.label}</span>
                <span className="font-mono text-xs text-[var(--color-dim)]">
                  {d.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
