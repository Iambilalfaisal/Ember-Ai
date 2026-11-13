"use client";

import { useUsers, type User } from "@ember/api";
import { useMemo } from "react";

/** People by id, for showing an owner's name or initials next to an id. */
export function useUserMap(): { users: User[]; byId: Map<string, User> } {
  const { data } = useUsers();
  return useMemo(() => {
    const users = data ?? [];
    return { users, byId: new Map(users.map((user) => [user.id, user])) };
  }, [data]);
}
