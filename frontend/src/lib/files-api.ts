/**
 * DEC-064: File upload (multipart/form-data) and download helpers.
 *
 * Upload goes to the entity-specific /upload endpoint which writes to disk.
 * Download uses GET /api/files/:id which streams from disk for new uploads,
 * or falls back to the embedded dataUrl for legacy records — the frontend
 * always uses this single URL regardless of storage method.
 *
 * API_BASE is injected via NEXT_PUBLIC_API_URL or defaults to relative.
 */

const API_BASE = (typeof window !== "undefined" && (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")) ?? "";

/** Upload a File to the given upload URL using multipart/form-data.
 *  Returns the parsed JSON response (the created attachment row). */
export async function uploadFile(
  uploadUrl: string,
  file: File,
  token: string | null
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${uploadUrl}`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(msg);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

/** Build the download URL for an attachment by ID.
 *  Works for both disk-path records (DEC-064) and legacy dataUrl records
 *  (which the backend serves via base64 inline). */
export function attachmentDownloadUrl(attachmentId: string): string {
  return `${API_BASE}/api/files/${encodeURIComponent(attachmentId)}`;
}
