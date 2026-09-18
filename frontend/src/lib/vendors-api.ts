const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type VendorType = "COMPANY" | "MARKETPLACE";
export type ApiVendor = {
  id: string;
  name: string;
  type: VendorType;
  link: string | null;
  contact: string | null;
  notes: string;
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

export const vendorsApi = {
  list: (token: string | null) => apiFetch<ApiVendor[]>("/vendors", token),
  create: (
    token: string | null,
    data: { name: string; type: VendorType; link: string | null; contact: string | null; notes: string }
  ) => apiFetch<ApiVendor>("/vendors", token, { method: "POST", body: JSON.stringify(data) }),
  update: (
    token: string | null,
    id: string,
    data: Partial<{ name: string; type: VendorType; link: string | null; contact: string | null; notes: string }>
  ) => apiFetch<ApiVendor>(`/vendors/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/vendors/${id}`, token, { method: "DELETE" }),
  // xlsx export (DEC-062). Same auth-via-Authorization-header pattern
  // as the other exporters.
  exportVendors: async (token: string | null): Promise<Blob> => {
    const res = await fetch(`${API_URL}/vendors/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Vendor export failed: ${res.status}`);
    return res.blob();
  },
};
