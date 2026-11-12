"use client";

import { useMe } from "@ember/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { canOpen, HOME, navItemFor } from "@/lib/routes";
import { useSession } from "@/lib/session";
import { AccountMenu } from "./AccountMenu";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

/**
 * The frame around every signed-in screen. Slots carry the demo-only pieces so the shell does not
 * depend on the demo feature.
 */
export function AppShell({
  children,
  demoControls,
  roleSwitcher,
  palette,
}: {
  children: ReactNode;
  demoControls?: ReactNode;
  roleSwitcher?: ReactNode;
  palette?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const userId = useSession((s) => s.userId);
  const { data: me } = useMe();

  // Not signed in: back to the sign-in screen.
  useEffect(() => {
    if (userId === null) router.replace("/sign-in");
  }, [userId, router]);

  // A role that cannot open this page goes home, and is told why.
  useEffect(() => {
    // me can still belong to the previous user for one render after a switch, so check the id.
    if (me && me.id === userId && !canOpen(pathname, me.role)) {
      const name = navItemFor(pathname)?.label ?? "That page";
      toast(`${name} isn't available for your role.`);
      router.replace(HOME[me.role]);
    }
  }, [me, userId, pathname, router]);

  if (userId === null || !me || me.id !== userId) return null;

  return (
    <div className="flex h-screen bg-ash text-coal">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-paper focus:px-3 focus:py-2 focus:shadow-float"
      >
        Skip to content
      </a>
      <SideNav role={me.role} demoControls={demoControls} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar account={<AccountMenu roleSwitcher={roleSwitcher} />} />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-6 outline-none">
          {canOpen(pathname, me.role) ? children : null}
        </main>
      </div>
      {palette}
    </div>
  );
}
