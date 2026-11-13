"use client";

import { useMyDay, useTeam } from "@ember/api";
import { Tooltip, cn } from "@ember/ui";
import { Flame, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_GROUPS, navFor, navItemFor, type Role } from "@/lib/routes";
import { usePrefs } from "@/lib/prefs";

function Count({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null;
  return (
    <span
      aria-label={label}
      className="ml-auto min-w-5 rounded-pill bg-nav-accent px-1.5 text-center text-xs font-medium leading-5 tabular-nums text-nav"
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

/** The brand mark: a flame on the brand gradient. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-control bg-brand text-iris-fg shadow-lift",
        className,
      )}
    >
      <Flame className="size-[18px] text-white" />
    </span>
  );
}

export function SideNav({ role, demoControls }: { role: Role; demoControls?: ReactNode }) {
  const pathname = usePathname();
  const collapsed = usePrefs((s) => s.navCollapsed);
  const toggle = usePrefs((s) => s.toggleNav);
  const current = navItemFor(pathname);
  const items = navFor(role);

  return (
    <nav
      aria-label="Main"
      data-surface="nav"
      className={cn(
        "flex shrink-0 flex-col bg-nav-rail text-nav-ink transition-ui",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4">
        <BrandMark />
        <span className={cn("text-lg font-semibold tracking-tight", collapsed && "sr-only")}>
          Ember
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-2 pt-1">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <section key={group} aria-label={group}>
              {collapsed ? (
                <div aria-hidden="true" className="mx-3 mb-1 h-px bg-nav-hover" />
              ) : (
                <p className="mb-1 px-2.5 text-xs font-medium text-nav-muted">{group}</p>
              )}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  const active = current?.href === item.href;
                  const Icon = item.icon;
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-control px-2.5 text-sm transition-ui",
                        active
                          ? "bg-nav-active font-medium text-nav-ink"
                          : "text-nav-muted hover:bg-nav-hover hover:text-nav-ink",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-pill bg-nav-accent"
                        />
                      ) : null}
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[18px] shrink-0 transition-ui group-hover:scale-110",
                          active && "text-nav-accent",
                        )}
                      />
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
            </section>
          );
        })}
      </div>

      <div className="space-y-0.5 border-t border-nav-hover p-2">
        {demoControls}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-control px-2.5 text-sm text-nav-muted transition-instant hover:bg-nav-hover hover:text-nav-ink",
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
