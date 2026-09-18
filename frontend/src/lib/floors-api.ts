const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiAsset = {
  id: string;
  code: string | null;
  name: string;
  quantity: number;
  notes: string;
  price: number | null;
  photoUrl: string | null;
  acquiredAt: string | null;
};
export type ApiFloor = {
  id: string;
  label: string;
  usage: string;
  description: string;
  order: number;
  assets: ApiAsset[];
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
    throw new Error(`API ${options?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const floorsApi = {
  list: (token: string | null) => apiFetch<ApiFloor[]>("/floors", token),
  updateDescription: (token: string | null, id: string, description: string) =>
    apiFetch<ApiFloor>(`/floors/${id}`, token, { method: "PATCH", body: JSON.stringify({ description }) }),
  addAsset: (
    token: string | null,
    floorId: string,
    data: {
      code: string | null;
      name: string;
      quantity: number;
      notes: string;
      price?: number | null;
      photoUrl?: string | null;
      acquiredAt?: string | null;
    }
  ) => apiFetch<ApiFloor>(`/floors/${floorId}/assets`, token, { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (
    token: string | null,
    floorId: string,
    assetId: string,
    data: Partial<{
      code: string | null;
      name: string;
      quantity: number;
      notes: string;
      price: number | null;
      photoUrl: string | null;
      acquiredAt: string | null;
    }>
  ) =>
    apiFetch<ApiFloor>(`/floors/${floorId}/assets/${assetId}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeAsset: (token: string | null, floorId: string, assetId: string) =>
    apiFetch<ApiFloor>(`/floors/${floorId}/assets/${assetId}`, token, { method: "DELETE" }),
  // xlsx export — the server returns the binary directly so the URL is
  // built without the auth header (the page adds a token via the
  // browser's session cookie alternative — for the SPA we use a
  // fetch+blob download to keep the Authorization header in scope).
  exportUrl: `${API_URL}/floors/export`,
  exportAssets: async (token: string | null): Promise<Blob> => {
    const res = await fetch(`${API_URL}/floors/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Asset export failed: ${res.status}`);
    return res.blob();
  },
};
