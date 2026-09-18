"use client";

import { useCallback, useEffect, useState } from "react";
import { documentTemplatesApi, type ApiDocumentTemplate, type NewTemplateFileData } from "@/lib/document-templates-api";
import { useAuth } from "./useAuth";

export function useDocumentTemplates() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<ApiDocumentTemplate[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setTemplates(await documentTemplatesApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load document templates:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const createTemplate = useCallback(
    async (data: { name: string; description: string } & NewTemplateFileData) => {
      const created = await documentTemplatesApi.create(token, data);
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [token]
  );

  const updateTemplate = useCallback(
    async (id: string, data: Partial<{ name: string; description: string } & NewTemplateFileData>) => {
      const updated = await documentTemplatesApi.update(token, id, data);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    },
    [token]
  );

  const removeTemplate = useCallback(
    async (id: string) => {
      await documentTemplatesApi.remove(token, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [token]
  );

  return { templates, hydrated, createTemplate, updateTemplate, removeTemplate };
}

export type UseDocumentTemplates = ReturnType<typeof useDocumentTemplates>;
