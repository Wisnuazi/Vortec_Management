import type { ApiAttachment } from "./projects-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApprovalTask = {
  id: string;
  title: string;
  description: string;
  // DEC-064: multi-role assignment — assignedRoleIds is canonical,
  // assignedRoleTitle kept for backward compat.
  assignedRoleIds: string[];
  assignedRoleTitles: string[];
  assignedRoleTitle: string | null; // backward compat — first element
  startDate: string | null;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  attachments: ApiAttachment[];
};

export type ApprovalMaterialRequest = {
  id: string;
  title: string;
  note: string;
  items: { id: string; materialName: string; quantity: number; unit: string; notes: string }[];
  projectId: string;
  projectName: string;
  requestedByUserName: string;
  createdAt: string;
  attachments: ApiAttachment[];
};

export type ApprovalsData = { tasks: ApprovalTask[]; materialRequests: ApprovalMaterialRequest[] };

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

export const approvalsApi = {
  list: (token: string | null) => apiFetch<ApprovalsData>("/approvals", token),
};
