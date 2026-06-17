"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Banner } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> skip the signup screen.
  useEffect(() => {
    if (!loading && user) router.replace("/enterprise/dashboard");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        company_name: companyName,
        full_name: fullName,
        email,
        password,
      });
      router.replace("/enterprise/dashboard");
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
          <h1 className="text-2xl font-bold tracking-tight">Create your organization</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Set up a new Croar Payroll workspace
          </p>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-7"
        >
          {error && <Banner>{error}</Banner>}
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Organization name</span>
            <input
              className="input"
              autoComplete="organization"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Your name</span>
            <input
              className="input"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="lbl">Work email</span>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="text-xs text-[var(--color-dim)]">At least 6 characters.</span>
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Creating…" : "Create organization"}
          </button>
          <p className="text-center text-xs text-[var(--color-muted)]">
            You&apos;ll be the administrator and can invite teammates afterwards.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[var(--color-primary)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
