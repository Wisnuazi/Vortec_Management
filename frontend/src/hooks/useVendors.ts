"use client";

import { useCallback, useEffect, useState } from "react";
import { vendorsApi, type ApiVendor, type VendorType } from "@/lib/vendors-api";
import { useAuth } from "./useAuth";

export function useVendors() {
  const { token } = useAuth();
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setVendors(await vendorsApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load vendors:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const createVendor = useCallback(
    async (data: { name: string; type: VendorType; link: string | null; contact: string | null; notes: string }) => {
      const created = await vendorsApi.create(token, data);
      setVendors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [token]
  );

  const updateVendor = useCallback(
    async (id: string, data: Partial<{ name: string; type: VendorType; link: string | null; contact: string | null; notes: string }>) => {
      const updated = await vendorsApi.update(token, id, data);
      setVendors((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    },
    [token]
  );

  const removeVendor = useCallback(
    async (id: string) => {
      await vendorsApi.remove(token, id);
      setVendors((prev) => prev.filter((v) => v.id !== id));
    },
    [token]
  );

  return { vendors, hydrated, createVendor, updateVendor, removeVendor };
}

export type UseVendors = ReturnType<typeof useVendors>;
