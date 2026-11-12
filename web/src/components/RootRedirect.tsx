"use client";

import { useMe } from "@ember/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME } from "@/lib/routes";
import { useSession } from "@/lib/session";

/** The front door: signed in people go to their home page, everyone else to sign in. */
export function RootRedirect() {
  const router = useRouter();
  const userId = useSession((s) => s.userId);
  const { data: me } = useMe();

  useEffect(() => {
    if (userId === null) router.replace("/sign-in");
    else if (me) router.replace(HOME[me.role]);
  }, [userId, me, router]);

  return (
    <main className="min-h-screen">
      <h1 className="sr-only">Ember</h1>
    </main>
  );
}
