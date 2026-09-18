"use client";

import { useCallback, useEffect, useState } from "react";
import {
  projectsApi,
  type ApiProject,
  type NewAttachmentData,
  type NewProjectData,
  type NewTaskData,
  type ProjectStage,
  type TaskStatus,
} from "@/lib/projects-api";
import { useAuth } from "./useAuth";

export function useProjects() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setProjects(await projectsApi.list(token));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load projects:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const applyUpdated = useCallback((updated: ApiProject) => {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const createProject = useCallback(
    async (data: NewProjectData): Promise<ApiProject | null> => {
      if (!data.name.trim()) throw new Error("Nama project wajib diisi.");
      try {
        const created = await projectsApi.create(token, data);
        applyUpdated(created);
        return created;
      } catch (err) {
        // Re-throw with a friendlier message — caller (form) handles toast/inline.
        const message = err instanceof Error ? err.message : "Gagal membuat project.";
        throw new Error(message);
      }
    },
    [token, applyUpdated]
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<NewProjectData & { stage: ProjectStage }>) => {
      const updated = await projectsApi.update(token, id, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeProject = useCallback(
    async (id: string) => {
      await projectsApi.remove(token, id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    },
    [token]
  );

  const addDocument = useCallback(
    async (projectId: string, name: string, team: string, stage: ProjectStage) => {
      const trimmedName = name.trim();
      const trimmedTeam = team.trim();
      if (!trimmedName || !trimmedTeam || !stage) {
        throw new Error("Nama, tim, dan stage wajib diisi untuk dokumen baru.");
      }
      const updated = await projectsApi.addDocument(token, projectId, {
        name: trimmedName,
        team: trimmedTeam,
        stage,
      });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const toggleDocument = useCallback(
    async (projectId: string, docId: string, done: boolean) => {
      const updated = await projectsApi.updateDocument(token, projectId, docId, { done });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeDocument = useCallback(
    async (projectId: string, docId: string) => {
      const updated = await projectsApi.removeDocument(token, projectId, docId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  // DEC-064: PM/OM approval gate on document checklist
  const reviewDocument = useCallback(
    async (projectId: string, docId: string, data: { reviewStatus: "APPROVED" | "REVISION"; reviewNote?: string }) => {
      const updated = await projectsApi.reviewDocument(token, projectId, docId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const createTask = useCallback(
    async (projectId: string, data: NewTaskData): Promise<ApiProject | null> => {
      if (!data.title.trim()) throw new Error("Judul task wajib diisi.");
      if (!data.stage) throw new Error("Stage wajib dipilih untuk task baru.");
      const updated = await projectsApi.addTask(token, projectId, data);
      applyUpdated(updated);
      return updated;
    },
    [token, applyUpdated]
  );

  const updateTask = useCallback(
    async (projectId: string, taskId: string, data: Partial<NewTaskData & { status: TaskStatus; note: string }>) => {
      const updated = await projectsApi.updateTask(token, projectId, taskId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeTask = useCallback(
    async (projectId: string, taskId: string) => {
      const updated = await projectsApi.removeTask(token, projectId, taskId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const submitMaterialRequest = useCallback(
    async (
      projectId: string,
      title: string,
      note: string,
      bomType: string,
      items: { materialName: string; quantity: number; unit: string; notes: string }[]
    ) => {
      if (!title.trim() || items.length === 0) return;
      const updated = await projectsApi.submitMaterialRequest(token, projectId, {
        title: title.trim(),
        note,
        bomType,
        items,
      });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const lockMaterialRequest = useCallback(
    async (projectId: string, locked: boolean) => {
      const updated = await projectsApi.lockMaterialRequest(token, projectId, locked);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const reviewMaterialRequest = useCallback(
    async (projectId: string, requestId: string, decision: "APPROVED" | "REJECTED", reviewNote: string) => {
      const updated = await projectsApi.reviewMaterialRequest(token, projectId, requestId, { decision, reviewNote });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const processMaterialRequest = useCallback(
    async (projectId: string, requestId: string, status: "PROCESSING" | "COMPLETED", purchaseNote: string) => {
      const updated = await projectsApi.processMaterialRequest(token, projectId, requestId, { status, purchaseNote });
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeMaterialRequest = useCallback(
    async (projectId: string, requestId: string) => {
      const updated = await projectsApi.removeMaterialRequest(token, projectId, requestId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  // DEC-064: refresh a single project from the server (used after multipart FILE uploads)
  const refreshProject = useCallback(
    async (projectId: string) => {
      if (!token) return;
      const updated = await projectsApi.get(token, projectId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const addTaskAttachment = useCallback(
    async (projectId: string, taskId: string, data: NewAttachmentData) => {
      const updated = await projectsApi.addTaskAttachment(token, projectId, taskId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const updateTaskAttachment = useCallback(
    async (
      projectId: string,
      taskId: string,
      attachmentId: string,
      data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
    ) => {
      const updated = await projectsApi.updateTaskAttachment(token, projectId, taskId, attachmentId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeTaskAttachment = useCallback(
    async (projectId: string, taskId: string, attachmentId: string) => {
      const updated = await projectsApi.removeTaskAttachment(token, projectId, taskId, attachmentId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const addSubtask = useCallback(
    async (projectId: string, taskId: string, title: string) => {
      if (!title.trim()) return;
      const updated = await projectsApi.addSubtask(token, projectId, taskId, title.trim());
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const updateSubtask = useCallback(
    async (projectId: string, taskId: string, subtaskId: string, data: Partial<{ title: string; done: boolean }>) => {
      const updated = await projectsApi.updateSubtask(token, projectId, taskId, subtaskId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeSubtask = useCallback(
    async (projectId: string, taskId: string, subtaskId: string) => {
      const updated = await projectsApi.removeSubtask(token, projectId, taskId, subtaskId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const addDocumentAttachment = useCallback(
    async (projectId: string, docId: string, data: NewAttachmentData) => {
      const updated = await projectsApi.addDocumentAttachment(token, projectId, docId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const updateDocumentAttachment = useCallback(
    async (
      projectId: string,
      docId: string,
      attachmentId: string,
      data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
    ) => {
      const updated = await projectsApi.updateDocumentAttachment(token, projectId, docId, attachmentId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeDocumentAttachment = useCallback(
    async (projectId: string, docId: string, attachmentId: string) => {
      const updated = await projectsApi.removeDocumentAttachment(token, projectId, docId, attachmentId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const addMaterialRequestAttachment = useCallback(
    async (projectId: string, requestId: string, data: NewAttachmentData) => {
      const updated = await projectsApi.addMaterialRequestAttachment(token, projectId, requestId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const updateMaterialRequestAttachment = useCallback(
    async (
      projectId: string,
      requestId: string,
      attachmentId: string,
      data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
    ) => {
      const updated = await projectsApi.updateMaterialRequestAttachment(token, projectId, requestId, attachmentId, data);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  const removeMaterialRequestAttachment = useCallback(
    async (projectId: string, requestId: string, attachmentId: string) => {
      const updated = await projectsApi.removeMaterialRequestAttachment(token, projectId, requestId, attachmentId);
      applyUpdated(updated);
    },
    [token, applyUpdated]
  );

  return {
    projects,
    hydrated,
    refreshProject,
    createProject,
    updateProject,
    removeProject,
    addDocument,
    toggleDocument,
    removeDocument,
    reviewDocument,
    createTask,
    updateTask,
    removeTask,
    submitMaterialRequest,
    lockMaterialRequest,
    reviewMaterialRequest,
    processMaterialRequest,
    removeMaterialRequest,
    addTaskAttachment,
    updateTaskAttachment,
    removeTaskAttachment,
    addSubtask,
    updateSubtask,
    removeSubtask,
    addDocumentAttachment,
    updateDocumentAttachment,
    removeDocumentAttachment,
    addMaterialRequestAttachment,
    updateMaterialRequestAttachment,
    removeMaterialRequestAttachment,
  };
}

export type UseProjects = ReturnType<typeof useProjects>;
