const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type TemplateKind = "FILE" | "LINK";
export type ApiDocumentTemplate = {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: string;
  updatedAt: string;
};

export type NewTemplateFileData =
  | { kind: "FILE"; fileName: string; mimeType: string; fileSize: number; dataUrl: string }
  | { kind: "LINK"; fileName: string; url: string };

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

export const documentTemplatesApi = {
  list: (token: string | null) => apiFetch<ApiDocumentTemplate[]>("/document-templates", token),
  create: (token: string | null, data: { name: string; description: string } & NewTemplateFileData) =>
    apiFetch<ApiDocumentTemplate>("/document-templates", token, { method: "POST", body: JSON.stringify(data) }),
  update: (
    token: string | null,
    id: string,
    data: Partial<{ name: string; description: string } & NewTemplateFileData>
  ) => apiFetch<ApiDocumentTemplate>(`/document-templates/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/document-templates/${id}`, token, { method: "DELETE" }),
};
