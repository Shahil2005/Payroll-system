"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthShell } from "@/components/AuthShell";
import { Banner } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const { user, loading, signup } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthShell>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">Create your organization</h1>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          Set up a new Croar Payroll workspace in seconds.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Banner>{error}</Banner>}
        <label className="flex flex-col gap-1.5">
          <span className="lbl">Organization name</span>
          <input
            className="input"
            autoComplete="organization"
            placeholder="Acme Pvt. Ltd."
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
            placeholder="Jane Doe"
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
              autoComplete="new-password"
              placeholder="At least 6 characters"
              required
              minLength={6}
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
          {submitting ? "Creating…" : "Create organization"}
        </button>
        <p className="text-center text-xs text-[var(--color-muted)]">
          You&apos;ll be the administrator and can invite teammates afterwards.
        </p>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-muted)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--color-primary)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
