"use client";

import { useCallback, useEffect, useState } from "react";
import { usersApi, type ManagedUser } from "@/lib/auth-api";
import { useAuth } from "./useAuth";

export function useUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      setUsers(await usersApi.list(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data user.");
    }
  }, [token]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const createUser = useCallback(
    async (data: {
      email: string;
      username: string | null;
      password: string;
      name: string;
      roleIds: string[];
      isSuperAdmin: boolean;
    }) => {
      if (!token) return;
      await usersApi.create(token, data);
      await reload();
    },
    [token, reload]
  );

  const updateUser = useCallback(
    async (
      id: string,
      data: Partial<{ name: string; username: string | null; roleIds: string[]; isSuperAdmin: boolean; password: string }>
    ) => {
      if (!token) return;
      await usersApi.update(token, id, data);
      await reload();
    },
    [token, reload]
  );

  const removeUser = useCallback(
    async (id: string) => {
      if (!token) return;
      await usersApi.remove(token, id);
      await reload();
    },
    [token, reload]
  );

  return { users, loading, error, createUser, updateUser, removeUser };
}
