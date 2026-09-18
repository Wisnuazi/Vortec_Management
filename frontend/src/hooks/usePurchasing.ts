"use client";

import { useCallback, useEffect, useState } from "react";
import {
  purchasingApi,
  type PurchasingMaterialRequest,
  type PurchasingTask,
  type PurchasingBomItem,
} from "@/lib/purchasing-api";
import { useAuth } from "./useAuth";

export function usePurchasing() {
  const { token } = useAuth();
  const [materialRequests, setMaterialRequests] = useState<PurchasingMaterialRequest[]>([]);
  const [tasks, setTasks] = useState<PurchasingTask[]>([]);
  const [approvedBom, setApprovedBom] = useState<PurchasingBomItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const [mr, t, bom] = await Promise.all([
      purchasingApi.materialRequests(token),
      purchasingApi.tasks(token),
      purchasingApi.approvedBom(token),
    ]);
    setMaterialRequests(mr);
    setTasks(t);
    setApprovedBom(bom);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load purchasing data:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  return { materialRequests, tasks, approvedBom, hydrated, reload };
}

export type UsePurchasing = ReturnType<typeof usePurchasing>;
