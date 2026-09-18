"use client";

import { useEffect, useState } from "react";

/**
 * DEC-069: persist a per-page view/layout preference in localStorage so
 * a user's last selection (e.g. "list" instead of "grid") survives a
 * navigation away + back. One key per route, no backend round-trip.
 *
 * Usage:
 *   const [layout, setLayout] = useViewPreference<Layout>(
 *     "projects.list",           // stable route-scoped key
 *     "list",                    // default if nothing saved
 *     ["list", "grid"] as const   // whitelist — guards against stale
 *                                // values from a removed view option
 *   );
 *
 * The whitelist matters because schema drift (e.g. we rename
 * "list" → "rows") would otherwise resurrect an old value the user
 * no longer has a UI for. Passing the current options keeps the
 * stored value honest.
 */
export function useViewPreference<T extends string>(
  key: string,
  defaultValue: T,
  validValues: readonly T[]
): [T, (next: T) => void] {
  const storageKey = `vortec.view.${key}`;
  const [value, setValue] = useState<T>(() => readFromStorage(storageKey, defaultValue, validValues));

  // Keep state in sync if another tab/window updates the same key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const next = readFromStorage(storageKey, defaultValue, validValues);
      setValue(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, defaultValue, validValues]);

  const setAndPersist = (next: T) => {
    setValue(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // localStorage unavailable (private mode, quota) — in-memory
      // state still works for the current session.
    }
  };

  return [value, setAndPersist];
}

function readFromStorage<T extends string>(
  storageKey: string,
  defaultValue: T,
  validValues: readonly T[]
): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && (validValues as readonly string[]).includes(raw)) {
      return raw as T;
    }
  } catch {
    return defaultValue;
  }
  return defaultValue;
}
