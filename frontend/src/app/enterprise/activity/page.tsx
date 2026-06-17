"use client";

import { useEffect, useState } from "react";
import { auditApi, type AuditEntry } from "@/utils/api";
import { Banner } from "@/components/ui";

function statusTone(code: number): string {
  if (code < 300) return "bg-[var(--color-accent)]/15 text-[var(--color-accent)]";
  if (code < 400) return "bg-[var(--color-info)]/15 text-[var(--color-info)]";
  if (code < 500) return "bg-[var(--color-warn)]/15 text-[var(--color-warn)]";
  return "bg-[var(--color-danger)]/15 text-[var(--color-danger)]";
}

function when(iso: string): string {
  // Backend audit timestamps are naive server-LOCAL (Postgres now()), not UTC.
  // A datetime string without a timezone is parsed as local time by JS, which
  // matches how it was stored — so don't append "Z" (that shifted it by the
  // local offset and showed the wrong time).
  return new Date(iso).toLocaleString();
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    auditApi
      .list(200)
      .then(setEntries)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Who did what, and when. The most recent actions across your organization.
        </p>
      </header>

      {error && <Banner>{error}</Banner>}

      {loading ? (
        <p className="py-8 text-center text-[var(--color-muted)]">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-dim)]">history</span>
          <p className="text-[var(--color-muted)]">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 font-semibold">Who</th>
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 text-[var(--color-muted)]">
                    {when(e.created_at)}
                  </td>
                  <td className="px-5 py-3">{e.actor_email ?? "—"}</td>
                  <td className="px-5 py-3 font-medium">{e.action}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${statusTone(
                        e.status_code
                      )}`}
                    >
                      {e.status_code}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
