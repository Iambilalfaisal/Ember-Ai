"use client";

import { useMyDay, useTeam } from "@ember/api";
import { Tooltip, cn } from "@ember/ui";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { navFor, navItemFor, type Role } from "@/lib/routes";
import { usePrefs } from "@/lib/prefs";

function Count({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null;
  return (
    <span
      aria-label={label}
      className="ml-auto min-w-5 rounded-pill bg-coal px-1.5 text-center text-xs leading-5 tabular-nums text-paper"
    >
      {value}
    </span>
  );
}

// Each count is its own component so a role only asks for data it is allowed to see.
const MyDayCount = () => {
  const { data } = useMyDay();
  return (
    <Count value={data?.counts.needYou ?? 0} label={`${data?.counts.needYou ?? 0} need you`} />
  );
};

const TeamCount = () => {
  const { data } = useTeam();
  const needing = data?.rows.filter((r) => r.deal.status !== "on_track").length ?? 0;
  return <Count value={needing} label={`${needing} need attention`} />;
};

export function SideNav({ role, demoControls }: { role: Role; demoControls?: ReactNode }) {
  const pathname = usePathname();
  const collapsed = usePrefs((s) => s.navCollapsed);
  const toggle = usePrefs((s) => s.toggleNav);
  const current = navItemFor(pathname);

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex shrink-0 flex-col border-r border-cinder bg-paper transition-ui",
        collapsed ? "w-16" : "w-58",
      )}
    >
      <div className="flex h-14 items-center border-b border-cinder px-4">
        <span className={cn("text-lg font-semibold tracking-tight", collapsed && "sr-only")}>
          Ember
        </span>
        {collapsed ? (
          <span aria-hidden="true" className="mx-auto text-lg font-semibold">
            E
          </span>
        ) : null}
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navFor(role).map((item) => {
          const active = current?.href === item.href;
          const Icon = item.icon;
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-control px-2.5 text-sm transition-instant",
                active
                  ? "bg-coal/8 font-medium text-coal"
                  : "text-smoke hover:bg-coal/8 hover:text-coal",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className={cn(collapsed && "sr-only")}>{item.label}</span>
              {!collapsed && item.href === "/my-day" ? <MyDayCount /> : null}
              {!collapsed && item.href === "/team" ? <TeamCount /> : null}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip content={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-0.5 border-t border-cinder p-2">
        {demoControls}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-control px-2.5 text-sm text-smoke transition-instant hover:bg-coal/8 hover:text-coal",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
          ) : (
            <>
              <PanelLeftClose aria-hidden="true" className="size-[18px]" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
