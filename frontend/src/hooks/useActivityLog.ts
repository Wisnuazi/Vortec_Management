"use client";

import { useCallback, useEffect, useState } from "react";
import { activityApi, type ActivityLogEntry, type OnlineUser, type ActivityLogFilters } from "@/lib/activity-api";
import { useAuth } from "./useAuth";

const POLL_MS = 30_000;

export function useActivityLog() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // DEC-078: current filter applied to the entries fetch. Caller
  // updates this via setFilters(...) to trigger a re-load. The online
  // list ignores these filters — "online" is a now-window, not a date
  // range.
  const [filters, setFilters] = useState<ActivityLogFilters>({});

  const reload = useCallback(async () => {
    if (!token) return;
    const [log, onlineUsers] = await Promise.all([activityApi.list(token, filters), activityApi.online(token)]);
    setEntries(log);
    setOnline(onlineUsers);
  }, [token, filters]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load activity log:", err))
      .finally(() => setHydrated(true));
    const interval = setInterval(() => {
      reload().catch((err) => console.error("Failed to refresh activity log:", err));
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [reload, token]);

  return { entries, online, hydrated, filters, setFilters, reload };
}

export type UseActivityLog = ReturnType<typeof useActivityLog>;