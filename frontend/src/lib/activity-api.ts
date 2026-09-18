const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ActivityLogEntry = {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  createdAt: string;
};

export type OnlineUser = {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  roleTitles: string[];
  lastSeenAt: string;
};

// DEC-078: shared filter shape used by the in-page list and the CSV
// download. `before` is a backward-pagination cursor (createdAt < before);
// `q` / `from` / `to` narrow the result set. The download endpoint
// ignores `before` so the user can fetch every matching row in one
// stream — no month cap, no row cap beyond what the backend streams.
export type ActivityLogFilters = {
  q?: string;
  from?: string;
  to?: string;
  before?: string;
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

// DEC-078: turn the filter object into a query string. Empty / undefined
// fields are skipped so the request stays clean.
function buildQuery(filters: ActivityLogFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.before) params.set("before", filters.before);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const activityApi = {
  list: (token: string | null, filters: ActivityLogFilters = {}) =>
    apiFetch<ActivityLogEntry[]>(`/activity-log${buildQuery(filters)}`, token),
  online: (token: string | null) => apiFetch<OnlineUser[]>("/activity-log/online", token),
  // DEC-078: CSV download. Returns the raw Response so the caller can
  // stream it into a Blob / file-save flow. Same query shape as `list`
  // (minus the `before` cursor, since the backend ignores it on
  // export). The backend sets Content-Disposition with a sensible
  // filename so the browser saves it without extra work.
  downloadCsv: async (token: string | null, filters: ActivityLogFilters = {}): Promise<Response> => {
    const url = `${API_URL}/activity-log/export.csv${buildQuery(filters)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
    return res;
  },
};