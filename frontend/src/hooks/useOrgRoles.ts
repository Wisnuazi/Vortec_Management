"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "@/lib/org-types";
import { orgApi, type ApiRole } from "@/lib/org-api";
import { useAuth } from "./useAuth";

function toRole(r: ApiRole): Role {
  return {
    id: r.id,
    title: r.title,
    parentId: r.parentId,
    jobDescription: r.jobDescription,
    // Keep both id and text so callers can PATCH /:id/jobdesk/<id>
    // and so the inline-edit affordance (DEC-059) has a stable id
    // to call back with. (Previously this was a `string[]` and the
    // id was looked up via the index in rawRoles — kept the index
    // path as a fallback in removeJobdeskItem by index.)
    jobdesk: r.jobdesk.map((j) => ({ id: j.id, text: j.text })),
    employees: r.employees,
    coSupervisorIds: r.coSupervisorIds,
    floorId: r.floorId,
    floorLabel: r.floorLabel,
  };
}

export function useOrgRoles() {
  const { token } = useAuth();
  const [rawRoles, setRawRoles] = useState<ApiRole[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const data = await orgApi.list(token);
    setRawRoles(data);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load organization data:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const applyUpdatedRole = useCallback((updated: ApiRole) => {
    setRawRoles((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const addRole = useCallback(async (parentId: string | null, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const created = await orgApi.create(token, parentId, trimmed);
    applyUpdatedRole(created);
  }, [token, applyUpdatedRole]);

  const renameRole = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = await orgApi.rename(token, id, trimmed);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const deleteRole = useCallback(async (id: string) => {
    await orgApi.remove(token, id);
    // Cascading deletes on the server may remove descendant roles too — reload for consistency.
    await reload();
  }, [token, reload]);

  // Member = a real User account in this role (via the UserRole join
  // table). Adding/removing here also updates the user's role list
  // because the same row drives auth — see DEC-059.
  const addMember = useCallback(async (roleId: string, userId: string) => {
    if (!userId) return;
    const updated = await orgApi.addMember(token, roleId, userId);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const removeMember = useCallback(async (roleId: string, userId: string) => {
    const updated = await orgApi.removeMember(token, roleId, userId);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const addJobdeskItem = useCallback(async (roleId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const updated = await orgApi.addJobdesk(token, roleId, trimmed);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const updateJobdeskItem = useCallback(async (roleId: string, jobdeskId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const updated = await orgApi.updateJobdesk(token, roleId, jobdeskId, trimmed);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const removeJobdeskItem = useCallback(async (roleId: string, index: number) => {
    const role = rawRoles.find((r) => r.id === roleId);
    const item = role?.jobdesk[index];
    if (!item) return;
    const updated = await orgApi.removeJobdesk(token, roleId, item.id);
    applyUpdatedRole(updated);
  }, [token, rawRoles, applyUpdatedRole]);

  const updateJobDescription = useCallback(async (roleId: string, text: string) => {
    const updated = await orgApi.updateJobDescription(token, roleId, text);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const setCoSupervisors = useCallback(async (roleId: string, supervisorIds: string[]) => {
    const updated = await orgApi.setSupervisors(token, roleId, supervisorIds);
    applyUpdatedRole(updated);
  }, [token, applyUpdatedRole]);

  const roles = useMemo(() => rawRoles.map(toRole), [rawRoles]);

  return {
    roles,
    hydrated,
    addRole,
    renameRole,
    deleteRole,
    addMember,
    removeMember,
    addJobdeskItem,
    updateJobdeskItem,
    removeJobdeskItem,
    updateJobDescription,
    setCoSupervisors,
  };
}

export type UseOrgRoles = ReturnType<typeof useOrgRoles>;
