"use client";

// App-wide replacement for the browser's blocking window.alert / window.confirm.
// Exposes async confirm()/alert() via useDialog(); both resolve when the user
// acts on a styled modal that matches the rest of the UI. Mounted once in the
// root layout so any client component can call it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Tone = "default" | "danger";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface AlertOptions {
  title?: string;
  message: string;
  tone?: Tone;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  alert: (opts: AlertOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface DialogState {
  kind: "confirm" | "alert";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: Tone;
  resolve: (value: boolean) => void;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [mounted, setMounted] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Focus the primary action and wire up Escape (cancel) / Enter (confirm).
  useEffect(() => {
    if (!dialog) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(dialog.kind === "alert");
      else if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const close = useCallback(
    (result: boolean) => {
      setDialog((d) => {
        d?.resolve(result);
        return null;
      });
    },
    []
  );

  const confirm = useCallback(
    (opts: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        const o = typeof opts === "string" ? { message: opts } : opts;
        setDialog({
          kind: "confirm",
          title: o.title ?? "Please confirm",
          message: o.message,
          confirmLabel: o.confirmLabel ?? "Confirm",
          cancelLabel: o.cancelLabel ?? "Cancel",
          tone: o.tone ?? "default",
          resolve,
        });
      }),
    []
  );

  const alert = useCallback(
    (opts: AlertOptions | string) =>
      new Promise<void>((resolve) => {
        const o = typeof opts === "string" ? { message: opts } : opts;
        setDialog({
          kind: "alert",
          title: o.title ?? "Notice",
          message: o.message,
          confirmLabel: "OK",
          cancelLabel: "",
          tone: o.tone ?? "default",
          resolve: () => resolve(),
        });
      }),
    []
  );

  const isDanger = dialog?.tone === "danger";
  const confirmCls = isDanger
    ? "bg-[var(--color-danger)] hover:opacity-90"
    : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]";
  const iconWrapCls = isDanger
    ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
    : "bg-[var(--color-primary)]/15 text-[var(--color-primary)]";
  const icon = isDanger
    ? "warning"
    : dialog?.kind === "confirm"
      ? "help"
      : "info";

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {mounted &&
        dialog &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
            onClick={() => close(dialog.kind === "alert")}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              className="animate-fade-in w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconWrapCls}`}
                >
                  <span className="material-symbols-outlined">{icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold">{dialog.title}</h2>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{dialog.message}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                {dialog.kind === "confirm" && (
                  <button
                    onClick={() => close(false)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-hover)] px-4 py-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  >
                    {dialog.cancelLabel}
                  </button>
                )}
                <button
                  ref={confirmBtnRef}
                  onClick={() => close(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${confirmCls}`}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within a DialogProvider");
  return ctx;
}
