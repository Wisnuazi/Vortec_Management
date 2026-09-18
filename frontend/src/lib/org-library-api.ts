const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

// Shared shape for both Workflow and SOP attachments (mirrors the per-route
// serialization in workflows.ts / sops.ts).
export type OrgLibraryAttachment = {
  id: string;
  kind: "FILE" | "LINK";
  fileName: string;
  mimeType: string;
  fileSize: number;
  diskPath: string | null;
  url: string | null;
  createdAt: string;
  uploadedByUserId: string;
  uploadedByUserName: string;
};

// Workflow = "how a particular piece of work flows" reference document.
export type Workflow = {
  id: string;
  name: string;
  description: string;
  steps: string;
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  createdByUserName: string;
  updatedByUserId: string | null;
  updatedByUserName: string | null;
  attachments: OrgLibraryAttachment[];
};

export type NewWorkflowData = {
  name: string;
  description?: string;
  steps?: string;
  category?: string;
  order?: number;
};

// SOP = "Standard Operating Procedure" — usually backed by an uploaded
// PDF/DOCX that is the authoritative reference.
export type SOP = {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  createdByUserName: string;
  updatedByUserId: string | null;
  updatedByUserName: string | null;
  attachments: OrgLibraryAttachment[];
};

export type NewSOPData = {
  title: string;
  summary?: string;
  content?: string;
  category?: string;
  order?: number;
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

async function apiUpload<T>(path: string, token: string | null, file: File): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: (() => {
      const fd = new FormData();
      fd.append("file", file);
      return fd;
    })(),
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
  return (await res.json()) as T;
}

export const workflowsApi = {
  list: (token: string | null) => apiFetch<Workflow[]>("/workflows", token),
  create: (token: string | null, data: NewWorkflowData) =>
    apiFetch<Workflow>("/workflows", token, { method: "POST", body: JSON.stringify(data) }),
  update: (token: string | null, id: string, data: Partial<NewWorkflowData>) =>
    apiFetch<Workflow>(`/workflows/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) =>
    apiFetch<void>(`/workflows/${id}`, token, { method: "DELETE" }),
  uploadAttachment: (token: string | null, id: string, file: File) =>
    apiUpload<OrgLibraryAttachment>(`/workflows/${id}/attachments/upload`, token, file),
  addAttachmentLink: (token: string | null, id: string, fileName: string, url: string) =>
    apiFetch<OrgLibraryAttachment>(`/workflows/${id}/attachments`, token, {
      method: "POST",
      body: JSON.stringify({ fileName, url }),
    }),
  removeAttachment: (token: string | null, id: string, attachmentId: string) =>
    apiFetch<void>(`/workflows/${id}/attachments/${attachmentId}`, token, { method: "DELETE" }),
};

export const sopsApi = {
  list: (token: string | null) => apiFetch<SOP[]>("/sops", token),
  create: (token: string | null, data: NewSOPData) =>
    apiFetch<SOP>("/sops", token, { method: "POST", body: JSON.stringify(data) }),
  update: (token: string | null, id: string, data: Partial<NewSOPData>) =>
    apiFetch<SOP>(`/sops/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) =>
    apiFetch<void>(`/sops/${id}`, token, { method: "DELETE" }),
  uploadAttachment: (token: string | null, id: string, file: File) =>
    apiUpload<OrgLibraryAttachment>(`/sops/${id}/attachments/upload`, token, file),
  addAttachmentLink: (token: string | null, id: string, fileName: string, url: string) =>
    apiFetch<OrgLibraryAttachment>(`/sops/${id}/attachments`, token, {
      method: "POST",
      body: JSON.stringify({ fileName, url }),
    }),
  removeAttachment: (token: string | null, id: string, attachmentId: string) =>
    apiFetch<void>(`/sops/${id}/attachments/${attachmentId}`, token, { method: "DELETE" }),
};
