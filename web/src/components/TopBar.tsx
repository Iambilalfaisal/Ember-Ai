"use client";

import { isDemoMode } from "@ember/api";
import { Button, DemoBadge } from "@ember/ui";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { titleFor } from "@/lib/routes";
import { useUi } from "@/lib/ui";
import { NotificationsMenu } from "./NotificationsMenu";

export function TopBar({ account }: { account: ReactNode }) {
  const pathname = usePathname();
  const openPalette = useUi((s) => s.setPaletteOpen);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-cinder bg-ash px-6">
      <h1 className="text-lg font-semibold">{titleFor(pathname)}</h1>
      <div className="ml-auto flex items-center gap-2">
        {isDemoMode() ? <DemoBadge /> : null}
        <Button
          variant="secondary"
          onClick={() => openPalette(true)}
          aria-label="Search or jump to"
          className="w-56 justify-start gap-2 font-normal text-smoke"
        >
          <Search aria-hidden="true" className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto rounded-control border border-cinder px-1.5 font-sans text-xs">
            {shortcut}
          </kbd>
        </Button>
        <NotificationsMenu />
        {account}
      </div>
    </header>
  );
}
