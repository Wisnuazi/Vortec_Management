const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiRole = {
  id: string;
  title: string;
  parentId: string | null;
  jobDescription: string;
  employees: { id: string; name: string }[];
  jobdesk: { id: string; text: string }[];
  coSupervisorIds: string[];
  floorId: string | null;
  floorLabel: string | null;
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

export const orgApi = {
  list: (token: string | null) => apiFetch<ApiRole[]>("/roles", token),
  create: (token: string | null, parentId: string | null, title: string) =>
    apiFetch<ApiRole>("/roles", token, { method: "POST", body: JSON.stringify({ parentId, title }) }),
  rename: (token: string | null, id: string, title: string) =>
    apiFetch<ApiRole>(`/roles/${id}`, token, { method: "PATCH", body: JSON.stringify({ title }) }),
  remove: (token: string | null, id: string) => apiFetch<void>(`/roles/${id}`, token, { method: "DELETE" }),
  updateJobDescription: (token: string | null, id: string, jobDescription: string) =>
    apiFetch<ApiRole>(`/roles/${id}/job-description`, token, {
      method: "PATCH",
      body: JSON.stringify({ jobDescription }),
    }),
  // The "employees" surface used to be a free-text name list on the
  // Role; it now references real User accounts via the UserRole join
  // table. Adding a member means inserting a UserRole (which auth and
  // permission checks already read), removing means deleting one. The
  // same `role.employees` field still comes back from the API, so
  // components that read `role.employees` keep working — see DEC-059.
  addMember: (token: string | null, roleId: string, userId: string) =>
    apiFetch<ApiRole>(`/roles/${roleId}/users/${userId}`, token, { method: "POST" }),
  removeMember: (token: string | null, roleId: string, userId: string) =>
    apiFetch<ApiRole>(`/roles/${roleId}/users/${userId}`, token, { method: "DELETE" }),
  addJobdesk: (token: string | null, id: string, text: string) =>
    apiFetch<ApiRole>(`/roles/${id}/jobdesk`, token, { method: "POST", body: JSON.stringify({ text }) }),
  updateJobdesk: (token: string | null, roleId: string, jobdeskId: string, text: string) =>
    apiFetch<ApiRole>(`/roles/${roleId}/jobdesk/${jobdeskId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),
  removeJobdesk: (token: string | null, id: string, jobdeskId: string) =>
    apiFetch<ApiRole>(`/roles/${id}/jobdesk/${jobdeskId}`, token, { method: "DELETE" }),
  setSupervisors: (token: string | null, id: string, supervisorIds: string[]) =>
    apiFetch<ApiRole>(`/roles/${id}/supervisors`, token, {
      method: "PUT",
      body: JSON.stringify({ supervisorIds }),
    }),
};
