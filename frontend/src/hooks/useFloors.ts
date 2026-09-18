"use client";

import { useCallback, useEffect, useState } from "react";
import { floorsApi, type ApiFloor } from "@/lib/floors-api";
import { useAuth } from "./useAuth";

export function useFloors() {
  const { token } = useAuth();
  const [floors, setFloors] = useState<ApiFloor[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setFloors(await floorsApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load floors/assets:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const applyUpdatedFloor = useCallback((updated: ApiFloor) => {
    setFloors((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const updateDescription = useCallback(
    async (floorId: string, description: string) => {
      const updated = await floorsApi.updateDescription(token, floorId, description);
      applyUpdatedFloor(updated);
    },
    [token, applyUpdatedFloor]
  );

  const addAsset = useCallback(
    async (
      floorId: string,
      code: string | null,
      name: string,
      quantity: number,
      notes: string,
      photoUrl?: string | null,
      acquiredAt?: string | null,
      price?: number | null
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const updated = await floorsApi.addAsset(token, floorId, {
        code: code?.trim() || null,
        name: trimmed,
        quantity,
        notes,
        photoUrl,
        acquiredAt,
        price,
      });
      applyUpdatedFloor(updated);
    },
    [token, applyUpdatedFloor]
  );

  const updateAsset = useCallback(
    async (
      floorId: string,
      assetId: string,
      data: Partial<{
        code: string | null;
        name: string;
        quantity: number;
        notes: string;
        photoUrl: string | null;
        acquiredAt: string | null;
        price: number | null;
      }>
    ) => {
      const updated = await floorsApi.updateAsset(token, floorId, assetId, data);
      applyUpdatedFloor(updated);
    },
    [token, applyUpdatedFloor]
  );

  const removeAsset = useCallback(
    async (floorId: string, assetId: string) => {
      const updated = await floorsApi.removeAsset(token, floorId, assetId);
      applyUpdatedFloor(updated);
    },
    [token, applyUpdatedFloor]
  );

  return { floors, hydrated, updateDescription, addAsset, updateAsset, removeAsset };
}

export type UseFloors = ReturnType<typeof useFloors>;
