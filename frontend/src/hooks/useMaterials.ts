"use client";

import { useCallback, useEffect, useState } from "react";
import { materialsApi, type ApiMaterial, type MovementType } from "@/lib/materials-api";
import { useAuth } from "./useAuth";

export function useMaterials() {
  const { token } = useAuth();
  const [materials, setMaterials] = useState<ApiMaterial[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setMaterials(await materialsApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load materials:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const applyUpdated = useCallback((updated: ApiMaterial) => {
    setMaterials((prev) => {
      const idx = prev.findIndex((m) => m.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const createMaterial = useCallback(
    async (code: string | null, name: string, unit: string, notes: string) => {
      const trimmedName = name.trim();
      const trimmedUnit = unit.trim();
      if (!trimmedName || !trimmedUnit) return;
      const created = await materialsApi.create(token, {
        code: code?.trim() || null,
        name: trimmedName,
        unit: trimmedUnit,
        notes,
      });
      applyUpdated(created);
    },
    [token, applyUpdated]
  );

  const updateMaterial = useCallback(
    async (id: string, data: Partial<{ code: string | null; name: string; unit: string; notes: string }>) => {
      const updated = await materialsApi.update(token, id, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeMaterial = useCallback(
    async (id: string) => {
      await materialsApi.remove(token, id);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    },
    [token]
  );

  const addMovement = useCallback(
    async (materialId: string, type: MovementType, quantity: number, note: string) => {
      if (!quantity || quantity <= 0) return;
      const updated = await materialsApi.addMovement(token, materialId, { type, quantity, note });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeMovement = useCallback(
    async (materialId: string, movementId: string) => {
      const updated = await materialsApi.removeMovement(token, materialId, movementId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  return { materials, hydrated, createMaterial, updateMaterial, removeMaterial, addMovement, removeMovement };
}

export type UseMaterials = ReturnType<typeof useMaterials>;
