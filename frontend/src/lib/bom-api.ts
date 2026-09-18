import type { BomType } from "./auth-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type { BomType };
export type BomItemStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "PROCESSING" | "ARRIVED";

export const BOM_TYPES: BomType[] = ["MBOM", "EBOM", "SBOM", "QBOM"];
export const BOM_ITEM_STATUSES: BomItemStatus[] = ["SUBMITTED", "APPROVED", "REJECTED", "PROCESSING", "ARRIVED"];

export type ApiBomItem = {
  id: string;
  projectId: string;
  projectName: string;
  // DEC-067: project's bomClosed flag inlined so the project BOM tab
  // can hide the add form and show the close metadata without a
  // second fetch.
  projectBomClosed: boolean;
  bomType: BomType;
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  notes: string;
  status: BomItemStatus;
  submittedByUserId: string;
  submittedByUserName: string;
  submittedAt: string;
  approvedByUserName: string | null;
  approvedAt: string | null;
  approveNote: string;
  processedByUserName: string | null;
  purchasingUpdatedAt: string | null;
  purchaseNote: string;
};

export type ApiBomSummary = {
  scope: "all" | "engineer" | "none";
  byType: { bomType: BomType; total: number }[];
  grandTotal: number;
};

// Lightweight i18n helpers — kept here (instead of in i18n.ts) so the
// BOM module owns its label vocabulary. The page that renders the
// table passes the locale in.
export function bomTypeLabel(bt: BomType, locale: "id" | "en") {
  const map: Record<BomType, { id: string; en: string }> = {
    MBOM: { id: "MBOM (Mekanikal)", en: "MBOM (Mechanical)" },
    EBOM: { id: "EBOM (Elektrikal)", en: "EBOM (Electrical)" },
    SBOM: { id: "SBOM (Software)", en: "SBOM (Software)" },
    QBOM: { id: "QBOM (Quality)", en: "QBOM (Quality)" },
  };
  return map[bt][locale];
}
export function bomItemStatusLabel(status: BomItemStatus, locale: "id" | "en") {
  const map: Record<BomItemStatus, { id: string; en: string }> = {
    SUBMITTED: { id: "Menunggu Approval", en: "Awaiting Approval" },
    APPROVED: { id: "Disetujui", en: "Approved" },
    REJECTED: { id: "Ditolak", en: "Rejected" },
    PROCESSING: { id: "Sedang Dibeli", en: "Being Purchased" },
    ARRIVED: { id: "Sudah Sampai", en: "Arrived" },
  };
  return map[status][locale];
}

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

export const bomApi = {
  list: (token: string | null, projectId?: string) => {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return apiFetch<ApiBomItem[]>(`/bom${qs}`, token);
  },
  create: (
    token: string | null,
    data: { projectId: string; bomType: BomType; name: string; quantity: number; unit: string; price?: number | null; notes: string }
  ) => apiFetch<ApiBomItem>("/bom", token, { method: "POST", body: JSON.stringify(data) }),
  update: (
    token: string | null,
    id: string,
    data: Partial<{ name: string; quantity: number; unit: string; price?: number | null; notes: string }>
  ) => apiFetch<ApiBomItem>(`/bom/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  review: (token: string | null, id: string, data: { decision: "APPROVED" | "REJECTED"; approveNote: string }) =>
    apiFetch<ApiBomItem>(`/bom/${id}/review`, token, { method: "PATCH", body: JSON.stringify(data) }),
  updatePurchasing: (token: string | null, id: string, data: { status: "PROCESSING" | "ARRIVED"; purchaseNote: string }) =>
    apiFetch<ApiBomItem>(`/bom/${id}/purchasing`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/bom/${id}`, token, { method: "DELETE" }),
  summary: (token: string | null) => apiFetch<ApiBomSummary>("/bom/summary", token),
  // DEC-067: returns the BomTypes the caller is allowed to submit
  // (drives the AddBomItemForm dropdown).
  allowedTypes: (token: string | null) =>
    apiFetch<{ types: BomType[] }>("/bom/allowed-types", token),
};
