"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";

type ToastTone = "success" | "error" | "info" | "warning";

type ToastInput = {
  title?: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type Toast = Required<Omit<ToastInput, "description" | "title">> & {
  id: string;
  title?: string;
  description?: string;
};

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4000;
const MAX_VISIBLE = 5;

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function toneIcon(tone: ToastTone) {
  if (tone === "success") return <CheckIcon />;
  if (tone === "error") return <AlertIcon />;
  if (tone === "warning") return <WarningIcon />;
  return <InfoIcon />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  // keep timers in a ref so unmounting can clear them
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setExiting((e) => ({ ...e, [id]: true }));
    // Wait for the exit animation, then remove
    const t = setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
      setExiting((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      delete timersRef.current[id];
    }, 140);
    timersRef.current[id] = t;
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = genId();
      const t: Toast = {
        id,
        tone: input.tone ?? "info",
        durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
        title: input.title,
        description: input.description,
      };
      setToasts((cur) => {
        const next = [t, ...cur];
        // Cap visible count to avoid runaway stacking; oldest gets dropped
        return next.slice(0, MAX_VISIBLE);
      });
      // Auto-dismiss
      const timer = setTimeout(() => dismiss(id), t.durationMs);
      timersRef.current[id] = timer;
      return id;
    },
    [dismiss]
  );

  // Clear all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: "success", title, description }),
      error: (title, description) => toast({ tone: "error", title, description, durationMs: 6000 }),
      info: (title, description) => toast({ tone: "info", title, description }),
      warning: (title, description) => toast({ tone: "warning", title, description }),
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={styles.region}
        aria-live="polite"
        aria-atomic="false"
        // role=status makes the region announce when its content changes
        // without forcing a keyboard focus shift; we keep the toasts themselves
        // non-focusable so the user's focus stays where it was (e.g. on the
        // submit button they just clicked).
        role="status"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]} ${exiting[t.id] ? styles.exiting : ""}`}>
            <span className={styles.icon}>{toneIcon(t.tone)}</span>
            <div className={styles.body}>
              {t.title ? <p className={styles.title}>{t.title}</p> : null}
              {t.description ? <p className={styles.description}>{t.description}</p> : null}
            </div>
            <button type="button" className={styles.dismiss} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <XIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provider missing in dev is a programmer error; surface it loudly.
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
