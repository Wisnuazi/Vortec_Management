"use client";

import { useCallback, useEffect, useState } from "react";
import { bomApi, type ApiBomItem, type ApiBomSummary, type BomType } from "@/lib/bom-api";
import { useAuth } from "./useAuth";

export function useBom() {
  const { token } = useAuth();
  const [items, setItems] = useState<ApiBomItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(
    async (projectId?: string) => {
      if (!token) return;
      setItems(await bomApi.list(token, projectId));
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    bomApi
      .list(token)
      .then(setItems)
      .catch((err) => console.error("Failed to load BOM items:", err))
      .finally(() => setHydrated(true));
  }, [token]);

  const applyUpdated = useCallback((updated: ApiBomItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const createItem = useCallback(
    async (data: {
      projectId: string;
      bomType: BomType;
      name: string;
      quantity: number;
      unit: string;
      price?: number | null;
      notes: string;
    }) => {
      const created = await bomApi.create(token, data);
      applyUpdated(created);
    },
    [token, applyUpdated]
  );

  const updateItem = useCallback(
    async (
      id: string,
      data: Partial<{ name: string; quantity: number; unit: string; price?: number | null; notes: string }>
    ) => {
      const updated = await bomApi.update(token, id, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const reviewItem = useCallback(
    async (id: string, decision: "APPROVED" | "REJECTED", approveNote: string) => {
      const updated = await bomApi.review(token, id, { decision, approveNote });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const updatePurchasing = useCallback(
    async (id: string, status: "PROCESSING" | "ARRIVED", purchaseNote: string) => {
      const updated = await bomApi.updatePurchasing(token, id, { status, purchaseNote });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeItem = useCallback(
    async (id: string) => {
      await bomApi.remove(token, id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [token]
  );

  return { items, hydrated, reload, createItem, updateItem, reviewItem, updatePurchasing, removeItem };
}

export function useBomSummary() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<ApiBomSummary | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const reload = useCallback(async () => {
    if (!token) return;
    try {
      setSummary(await bomApi.summary(token));
    } catch (err) {
      console.error("Failed to load BOM summary:", err);
      setSummary({ scope: "none", byType: [], grandTotal: 0 });
    } finally {
      setHydrated(true);
    }
  }, [token]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { summary, hydrated, reload };
}

export type UseBom = ReturnType<typeof useBom>;
