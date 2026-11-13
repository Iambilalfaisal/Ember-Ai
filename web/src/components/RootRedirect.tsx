"use client";

import { useMe } from "@ember/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME } from "@/lib/routes";
import { useSession } from "@/lib/session";

/** Signed in people who open the front door go straight to their home page. Renders nothing. */
export function SignedInRedirect() {
  const router = useRouter();
  const userId = useSession((s) => s.userId);
  const { data: me } = useMe();

  useEffect(() => {
    if (userId !== null && me) router.replace(HOME[me.role]);
  }, [userId, me, router]);

  return null;
}
