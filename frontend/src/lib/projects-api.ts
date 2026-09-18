const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ProjectStage =
  | "INITIATION"
  | "REQUIREMENT"
  | "DESIGN"
  | "PROCUREMENT"
  | "FABRICATION"
  | "TESTING"
  | "FINAL_REVIEW"
  | "RELEASED"
  | "PACKAGING"
  | "ON_HOLD"
  | "REJECTED";

type Locale = "id" | "en";

export const PROJECT_STAGES: { value: ProjectStage; label: { id: string; en: string } }[] = [
  { value: "INITIATION", label: { id: "Inisiasi", en: "Initiation" } },
  { value: "REQUIREMENT", label: { id: "Requirement & PRD", en: "Requirement & PRD" } },
  { value: "DESIGN", label: { id: "Desain", en: "Design" } },
  { value: "PROCUREMENT", label: { id: "Purchasing", en: "Procurement" } },
  { value: "FABRICATION", label: { id: "Fabrikasi & Produksi", en: "Fabrication & Production" } },
  { value: "TESTING", label: { id: "Testing & Validasi", en: "Testing & Validation" } },
  { value: "FINAL_REVIEW", label: { id: "Final Review", en: "Final Review" } },
  { value: "RELEASED", label: { id: "Selesai (Released)", en: "Released" } },
  { value: "PACKAGING", label: { id: "Packaging & Gudang", en: "Packaging & Warehouse" } },
  { value: "ON_HOLD", label: { id: "Ditahan (Hold)", en: "On Hold" } },
  { value: "REJECTED", label: { id: "Ditolak", en: "Rejected" } },
];

export function stageLabel(stage: ProjectStage, locale: Locale = "id"): string {
  return PROJECT_STAGES.find((s) => s.value === stage)?.label[locale] ?? stage;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "WAITING_APPROVAL" | "DONE" | "REJECTED";

export const TASK_STATUSES: { value: TaskStatus; label: { id: string; en: string } }[] = [
  { value: "TODO", label: { id: "To Do", en: "To Do" } },
  { value: "IN_PROGRESS", label: { id: "In Progress", en: "In Progress" } },
  { value: "WAITING_APPROVAL", label: { id: "Menunggu Approval", en: "Awaiting Approval" } },
  { value: "DONE", label: { id: "Selesai", en: "Done" } },
  { value: "REJECTED", label: { id: "Ditolak", en: "Rejected" } },
];

export function taskStatusLabel(status: TaskStatus, locale: Locale = "id"): string {
  return TASK_STATUSES.find((s) => s.value === status)?.label[locale] ?? status;
}

export type AttachmentKind = "FILE" | "LINK";

export type ApiAttachment = {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  createdAt: string;
  uploadedByUserId: string;
  uploadedByUserName: string;
  // DEC-064: diskPath is null for legacy dataUrl records; non-null for new uploads.
  // Frontend uses GET /api/files/:id for all downloads (handles both cases).
};

export type NewAttachmentData =
  | { kind: "FILE"; fileName: string; mimeType: string; fileSize: number; dataUrl: string }
  | { kind: "LINK"; fileName: string; url: string };

export type ApiSubtask = { id: string; title: string; done: boolean; order: number };

export type ApiTask = {
  id: string;
  title: string;
  description: string;
  // DEC-064: multi-role task assignment — assignedRoleIds is the canonical
  // field; assignedRoleId/assignedRoleTitle kept for backward compat with
  // callers that only need one.
  assignedRoleIds: string[];
  assignedRoleTitles: string[];
  assignedRoleId: string | null; // backward compat — first element of assignedRoleIds
  assignedRoleTitle: string | null; // backward compat — first element of assignedRoleTitles
  status: TaskStatus;
  requiresApproval: boolean;
  // DEC-065: workflow stage (the lane in the workflow diagram this task
  // belongs to). Required for new tasks — the AddTask form enforces this.
  // Nullable on legacy rows pre-DEC-065 (will be backfilled by migration).
  stage: ProjectStage | null;
  approvedByUserId: string | null;
  approvedByUserName: string | null;
  approvedAt: string | null;
  order: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  attachments: ApiAttachment[];
  subtasks: ApiSubtask[];
  // Free-text note writable by the assigned-role team (and PM/OM/
  // Director). Structural fields (title/dates/assignment) stay
  // PM-only — see DEC-052 follow-up.
  note: string;
};

// DEC-064: task can be assigned to multiple roles. canActOnTask returns
// true if the caller holds ANY of the task's assigned roles.
export function canActOnTask(
  user: { isSuperAdmin: boolean; roleIds: string[] } | null,
  task: { assignedRoleIds: string[] | null | undefined }
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const ids = task.assignedRoleIds ?? [];
  return ids.some((rid) => user.roleIds.includes(rid));
}

// "Mine" = the task's assigned role is one of the caller's roles, or
// the caller is privileged (super admin / OM / Director — see DEC-051,
// who can act on every task anyway). Used by the task views to
// visually highlight what's actually in front of the user vs. what
// is someone else's work — the "you can see everything, but here's
// what matters to you" affordance the user asked for in DEC-053.
export function isTaskMine(
  user: { isSuperAdmin: boolean; roleIds: string[] } | null,
  task: { assignedRoleIds: string[] | null | undefined }
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const ids = task.assignedRoleIds ?? [];
  return ids.some((rid) => user.roleIds.includes(rid));
}

export type MaterialRequestStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED";

export const MATERIAL_REQUEST_STATUSES: { value: MaterialRequestStatus; label: { id: string; en: string } }[] = [
  { value: "SUBMITTED", label: { id: "Menunggu Review PM", en: "Awaiting PM Review" } },
  { value: "APPROVED", label: { id: "Disetujui — Diproses Purchasing", en: "Approved — With Purchasing" } },
  { value: "REJECTED", label: { id: "Ditolak", en: "Rejected" } },
  { value: "PROCESSING", label: { id: "Sedang Dibeli", en: "Being Purchased" } },
  { value: "COMPLETED", label: { id: "Selesai Dibeli", en: "Purchase Completed" } },
];

export function materialRequestStatusLabel(status: MaterialRequestStatus, locale: Locale = "id"): string {
  return MATERIAL_REQUEST_STATUSES.find((s) => s.value === status)?.label[locale] ?? status;
}

export type ApiMaterialRequestItem = { id: string; materialName: string; quantity: number; unit: string; notes: string };
export type ApiMaterialRequest = {
  id: string;
  title: string;
  note: string;
  status: MaterialRequestStatus;
  // DEC-068: the BomType the submitter tagged (MBOM/EBOM/SBOM/QBOM)
  // — chosen at submit time from their roles' allowedBomTypes.
  bomType: string | null;
  items: ApiMaterialRequestItem[];
  requestedByUserId: string;
  requestedByUserName: string;
  reviewedByUserName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  processedByUserName: string | null;
  processedAt: string | null;
  purchaseNote: string;
  createdAt: string;
  attachments: ApiAttachment[];
};

// DEC-064: reviewStatus tracks PM/OM approval gate on top of the done checkbox.
// PENDING = awaiting review, APPROVED = PM/OM signed off, REVISION = sent back.
// DEC-065: stage is the workflow lane — required for new documents, nullable
// on legacy pre-DEC-065 rows.
export type ApiProjectDocument = {
  id: string;
  name: string;
  team: string;
  stage: ProjectStage | null;
  done: boolean;
  note: string;
  reviewStatus: "PENDING" | "APPROVED" | "REVISION";
  reviewedByUserName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  attachments: ApiAttachment[];
};
export type ApiProject = {
  id: string;
  name: string;
  clientName: string;
  problemStatement: string;
  targetProduct: string;
  budget: string;
  startDate: string | null;
  targetDate: string | null;
  stage: ProjectStage;
  picUserId: string | null;
  picUserName: string | null;
  // DEC-067: Open/Close BOM state.
  bomClosed: boolean;
  bomClosedAt: string | null;
  bomClosedByUserId: string | null;
  bomClosedByUserName: string | null;
  // DEC-068: Pengajuan Bahan Baku lock state.
  materialRequestLocked: boolean;
  materialRequestLockedAt: string | null;
  materialRequestLockedByUserId: string | null;
  materialRequestLockedByUserName: string | null;
  documents: ApiProjectDocument[];
  tasks: ApiTask[];
  materialRequests: ApiMaterialRequest[];
};

export type ApiPerformanceTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  assignedRoleId: string | null;
  assignedRoleTitle: string | null;
  status: TaskStatus;
  requiresApproval: boolean;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

async function apiFetch<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      throw new Error(parsed.error || text);
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(text || `Request failed (${res.status})`);
      throw err;
    }
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type NewProjectData = {
  name: string;
  clientName: string;
  problemStatement: string;
  targetProduct: string;
  budget: string;
  startDate: string | null;
  targetDate: string | null;
  picUserId: string | null;
};

export type NewTaskData = {
  title: string;
  description: string;
  // DEC-064: multi-role assignment — assignedRoleIds is canonical;
  // assignedRoleId kept for backward compat with the backend.
  assignedRoleIds: string[] | null;
  assignedRoleId: string | null;
  requiresApproval: boolean;
  // DEC-065: stage is required for new tasks (workflow lane). The AddTask
  // form enforces this client-side; the backend also returns 400 if
  // missing.
  stage: ProjectStage;
  startDate: string | null;
  dueDate: string | null;
};

export const projectsApi = {
  list: (token: string | null) => apiFetch<ApiProject[]>("/projects", token),
  get: (token: string | null, id: string) => apiFetch<ApiProject>(`/projects/${id}`, token),
  teamPerformance: (token: string | null) => apiFetch<ApiPerformanceTask[]>("/projects/performance/tasks", token),
  create: (token: string | null, data: NewProjectData) =>
    apiFetch<ApiProject>("/projects", token, { method: "POST", body: JSON.stringify(data) }),
  update: (token: string | null, id: string, data: Partial<NewProjectData & { stage: ProjectStage }>) =>
    apiFetch<ApiProject>(`/projects/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/projects/${id}`, token, { method: "DELETE" }),
  // DEC-067: close the project's BOM. Body must include `confirmText`
  // matching the exact phrase `close <project-name>` (enforced server-
  // side too, see routes/projects.ts).
  closeBom: (token: string | null, projectId: string, confirmText: string) =>
    apiFetch<{ project: ApiProject; rekap: { type: string; attachmentId: string; documentId: string | null }[] }>(
      `/projects/${projectId}/bom/close`,
      token,
      { method: "POST", body: JSON.stringify({ confirmText }) }
    ),
  addDocument: (token: string | null, projectId: string, data: { name: string; team: string; stage: ProjectStage }) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDocument: (
    token: string | null,
    projectId: string,
    docId: string,
    data: Partial<{ done: boolean; note: string }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeDocument: (token: string | null, projectId: string, docId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}`, token, { method: "DELETE" }),
  // DEC-064: PM/OM approval gate — can set reviewStatus to APPROVED or REVISION
  reviewDocument: (
    token: string | null,
    projectId: string,
    docId: string,
    data: { reviewStatus: "APPROVED" | "REVISION"; reviewNote?: string }
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}/review`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  addTask: (token: string | null, projectId: string, data: NewTaskData) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks`, token, { method: "POST", body: JSON.stringify(data) }),
  updateTask: (
    token: string | null,
    projectId: string,
    taskId: string,
    data: Partial<NewTaskData & { status: TaskStatus; note: string }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeTask: (token: string | null, projectId: string, taskId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}`, token, { method: "DELETE" }),
  submitMaterialRequest: (
    token: string | null,
    projectId: string,
    data: {
      title: string;
      note: string;
      // DEC-068: Jenis BOM dropdown value (MBOM/EBOM/SBOM/QBOM).
      bomType: string;
      items: { materialName: string; quantity: number; unit: string; notes: string }[];
    }
  ) => apiFetch<ApiProject>(`/projects/${projectId}/material-requests`, token, { method: "POST", body: JSON.stringify(data) }),
  // DEC-068: toggle the Pengajuan Bahan Baku lock for a project.
  lockMaterialRequest: (token: string | null, projectId: string, locked: boolean) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/lock`, token, {
      method: "POST",
      body: JSON.stringify({ locked }),
    }),
  reviewMaterialRequest: (
    token: string | null,
    projectId: string,
    requestId: string,
    data: { decision: "APPROVED" | "REJECTED"; reviewNote: string }
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}/review`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  processMaterialRequest: (
    token: string | null,
    projectId: string,
    requestId: string,
    data: { status: "PROCESSING" | "COMPLETED"; purchaseNote: string }
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}/process`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeMaterialRequest: (token: string | null, projectId: string, requestId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}`, token, { method: "DELETE" }),
  addTaskAttachment: (token: string | null, projectId: string, taskId: string, data: NewAttachmentData) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/attachments`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeTaskAttachment: (token: string | null, projectId: string, taskId: string, attachmentId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`, token, {
      method: "DELETE",
    }),
  updateTaskAttachment: (
    token: string | null,
    projectId: string,
    taskId: string,
    attachmentId: string,
    data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  addSubtask: (token: string | null, projectId: string, taskId: string, title: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/subtasks`, token, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateSubtask: (
    token: string | null,
    projectId: string,
    taskId: string,
    subtaskId: string,
    data: Partial<{ title: string; done: boolean }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeSubtask: (token: string | null, projectId: string, taskId: string, subtaskId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`, token, {
      method: "DELETE",
    }),
  addDocumentAttachment: (token: string | null, projectId: string, docId: string, data: NewAttachmentData) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}/attachments`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeDocumentAttachment: (token: string | null, projectId: string, docId: string, attachmentId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}/attachments/${attachmentId}`, token, {
      method: "DELETE",
    }),
  updateDocumentAttachment: (
    token: string | null,
    projectId: string,
    docId: string,
    attachmentId: string,
    data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/documents/${docId}/attachments/${attachmentId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  addMaterialRequestAttachment: (token: string | null, projectId: string, requestId: string, data: NewAttachmentData) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}/attachments`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeMaterialRequestAttachment: (token: string | null, projectId: string, requestId: string, attachmentId: string) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}/attachments/${attachmentId}`, token, {
      method: "DELETE",
    }),
  updateMaterialRequestAttachment: (
    token: string | null,
    projectId: string,
    requestId: string,
    attachmentId: string,
    data: Partial<{ fileName: string; dataUrl: string; mimeType: string; fileSize: number; url: string }>
  ) =>
    apiFetch<ApiProject>(`/projects/${projectId}/material-requests/${requestId}/attachments/${attachmentId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
