"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";
import { landingPath } from "@/utils/auth";

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> skip the login screen (employees land in their own area).
  useEffect(() => {
    if (!loading && user) router.replace(landingPath(user));
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email, password);
      // Route by role: self-service users land in their own area.
      router.replace(landingPath(signedIn));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          Sign in to your Croar Payroll workspace.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Banner>{error}</Banner>}
        <label className="flex flex-col gap-1.5">
          <span className="lbl">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="lbl">Password</span>
          <div className="relative">
            <input
              className="input pr-11"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--color-dim)] hover:text-[var(--color-text)]"
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </label>
        <button type="submit" disabled={submitting} className="btn-primary mt-1">
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Demo accounts
        </p>
        <div className="flex flex-col gap-1">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
              }}
              className="group flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-hover)]"
            >
              <span className="font-medium">{d.label}</span>
              <span className="font-mono text-xs text-[var(--color-dim)] group-hover:text-[var(--color-muted)]">
                {d.email}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-7 text-center text-sm text-[var(--color-muted)]">
        Don&apos;t have an organization?{" "}
        <Link
          href="/signup"
          className="font-semibold text-[var(--color-primary)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
