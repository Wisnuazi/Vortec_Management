const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type MovementType = "IN" | "OUT";
export type ApiMovement = { id: string; type: MovementType; quantity: number; note: string; createdAt: string };
export type ApiMaterial = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  notes: string;
  totalIn: number;
  totalOut: number;
  stock: number;
  movements: ApiMovement[];
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

export const materialsApi = {
  list: (token: string | null) => apiFetch<ApiMaterial[]>("/materials", token),
  create: (token: string | null, data: { code: string | null; name: string; unit: string; notes: string }) =>
    apiFetch<ApiMaterial>("/materials", token, { method: "POST", body: JSON.stringify(data) }),
  update: (
    token: string | null,
    id: string,
    data: Partial<{ code: string | null; name: string; unit: string; notes: string }>
  ) => apiFetch<ApiMaterial>(`/materials/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/materials/${id}`, token, { method: "DELETE" }),
  addMovement: (
    token: string | null,
    materialId: string,
    data: { type: MovementType; quantity: number; note: string }
  ) =>
    apiFetch<ApiMaterial>(`/materials/${materialId}/movements`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeMovement: (token: string | null, materialId: string, movementId: string) =>
    apiFetch<ApiMaterial>(`/materials/${materialId}/movements/${movementId}`, token, { method: "DELETE" }),
  // DEC-061 — confirm the dedupe prompt by recording an IN stock
  // movement for the existing material (stock is computed, not
  // stored). The 409-with-existing flow lives in the page, not here.
  confirmDuplicate: (token: string | null, materialId: string, data: { quantity: number; note?: string }) =>
    apiFetch<ApiMaterial>(`/materials/${materialId}/confirm-duplicate`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // xlsx export — same auth-via-Authorization-header pattern as floors.
  exportMaterials: async (token: string | null): Promise<Blob> => {
    const res = await fetch(`${API_URL}/materials/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Material export failed: ${res.status}`);
    return res.blob();
  },
};
