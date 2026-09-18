"use client";

import { useEffect, useState } from "react";

/**
 * DEC-069: persist a per-page filter / search selection in localStorage
 * so the user's last input survives navigation away + back. Mirrors
 * `useViewPreference` (which only stores enum-style view modes) but
 * supports any JSON-serializable value: strings, string arrays, numbers,
 * booleans, or a structured object.
 *
 * Usage:
 *   const [query, setQuery] = useFilterPreference("purchasing.search", "");
 *   const [status, setStatus] = useFilterPreference<StatusFilter>(
 *     "purchasing.status",
 *     "ALL",
 *   );
 *
 * Notes:
 * - One localStorage key per route-scoped id, namespaced
 *   `vortec.filter.<id>`.
 * - Defaults to the supplied `defaultValue` when nothing is saved or
 *   the stored JSON fails to parse.
 * - Syncs across browser tabs via the `storage` event so two open tabs
 *   stay in step.
 */
export function useFilterPreference<T>(
  key: string,
  defaultValue: T
): [T, (next: T) => void] {
  const storageKey = `vortec.filter.${key}`;
  const [value, setValue] = useState<T>(() => readFromStorage(storageKey, defaultValue));

  // Cross-tab sync — same shape as useViewPreference.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const next = readFromStorage(storageKey, defaultValue);
      setValue(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, defaultValue]);

  const setAndPersist = (next: T) => {
    setValue(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode, quota) — in-memory
      // state still works for the current session.
    }
  };

  return [value, setAndPersist];
}

function readFromStorage<T>(storageKey: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}
