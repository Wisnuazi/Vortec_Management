import type { ApiAttachment } from "./projects-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type PurchasingMaterialRequest = {
  id: string;
  title: string;
  note: string;
  status: "APPROVED" | "PROCESSING" | "COMPLETED";
  items: { id: string; materialName: string; quantity: number; unit: string; notes: string }[];
  projectId: string;
  projectName: string;
  requestedByUserName: string;
  reviewedByUserName: string | null;
  reviewNote: string;
  processedByUserName: string | null;
  purchaseNote: string;
  createdAt: string;
  attachments: ApiAttachment[];
};

export type PurchasingTask = {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "WAITING_APPROVAL" | "DONE" | "REJECTED";
  requiresApproval: boolean;
  approvedByUserName: string | null;
  approvedAt: string | null;
  startDate: string | null;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  attachments: ApiAttachment[];
};

// DEC-062: an approved BOM item flows to the Purchasing queue. Same
// status vocabulary as the BomItem model, plus the metadata (price,
// approver, etc.) that the engineer filled in. Purchasing flips
// status between PROCESSING and ARRIVED; everything else is read-only.
export type PurchasingBomItem = {
  id: string;
  projectId: string;
  projectName: string;
  bomType: "MBOM" | "EBOM" | "SBOM";
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  notes: string;
  status: "APPROVED" | "PROCESSING" | "ARRIVED";
  submittedByUserName: string;
  approvedByUserName: string | null;
  approvedAt: string | null;
  approveNote: string;
  processedByUserName: string | null;
  purchasingUpdatedAt: string | null;
  purchaseNote: string;
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

export const purchasingApi = {
  materialRequests: (token: string | null) => apiFetch<PurchasingMaterialRequest[]>("/purchasing/material-requests", token),
  tasks: (token: string | null) => apiFetch<PurchasingTask[]>("/purchasing/tasks", token),
  approvedBom: (token: string | null) => apiFetch<PurchasingBomItem[]>("/purchasing/approved-bom", token),
};
