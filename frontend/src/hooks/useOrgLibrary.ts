"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { workflowsApi, sopsApi, type Workflow, type SOP } from "@/lib/org-library-api";

type Reloadable = {
  hydrated: boolean;
  reload: () => Promise<void>;
};

function useResourceList<T>(fetcher: (token: string | null) => Promise<T[]>): Reloadable & { items: T[] } {
  const { token } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetcher(token);
      setItems(data);
    } catch (err) {
      console.error("Failed to load org library:", err);
    } finally {
      setHydrated(true);
    }
  }, [token, fetcher]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, hydrated, reload };
}

export function useWorkflows() {
  return useResourceList<Workflow>(workflowsApi.list);
}

export function useSops() {
  return useResourceList<SOP>(sopsApi.list);
}

// DEC-072: combined loader for the About-hub hero on /organization —
// one fetch pair (workflows + SOPs) so the hero stats resolve together.
export function useOrgLibrary() {
  const workflows = useWorkflows();
  const sops = useSops();
  return {
    workflows: workflows.items,
    sops: sops.items,
    hydrated: workflows.hydrated && sops.hydrated,
    reload: async () => {
      await Promise.all([workflows.reload(), sops.reload()]);
    },
  };
}
