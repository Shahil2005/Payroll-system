"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CycleStatus } from "@/utils/api";

const CYCLE_BADGE: Record<CycleStatus, string> = {
  DRAFT: "bg-[var(--color-warn)]/15 text-[var(--color-warn)]",
  PROCESSING: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  APPROVED: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  PAID: "bg-[var(--color-info)]/15 text-[var(--color-info)]",
  CANCELLED: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = CYCLE_BADGE[status as CycleStatus] ?? "bg-[var(--color-hover)] text-[var(--color-muted)]";
  return (
    <span className={`inline-block rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

export function PayslipBadge({ status }: { status: string }) {
  const cls =
    status === "PAID"
      ? "bg-[var(--color-info)]/15 text-[var(--color-info)]"
      : "bg-[var(--color-warn)]/15 text-[var(--color-warn)]";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Banner({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/30"
      : "bg-[var(--color-warn)]/10 text-[var(--color-warn)] border-[var(--color-warn)]/30";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
