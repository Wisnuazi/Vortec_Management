"use client";

import { useCallback, useEffect, useState } from "react";
import { approvalsApi, type ApprovalsData } from "@/lib/approvals-api";
import { useAuth } from "./useAuth";

export function useApprovals() {
  const { token } = useAuth();
  const [data, setData] = useState<ApprovalsData>({ tasks: [], materialRequests: [] });
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setData(await approvalsApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load approvals:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  return { ...data, hydrated, reload };
}

export type UseApprovals = ReturnType<typeof useApprovals>;
