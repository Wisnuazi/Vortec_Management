"use client";

import { useEffect, useState } from "react";
import { basicUsersApi, type BasicUser } from "@/lib/auth-api";
import { useAuth } from "./useAuth";

export function useBasicUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<BasicUser[]>([]);

  useEffect(() => {
    if (!token) return;
    basicUsersApi.list(token).then(setUsers).catch((err) => console.error("Failed to load user directory:", err));
  }, [token]);

  return users;
}
