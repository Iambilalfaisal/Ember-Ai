"use client";

import { cn } from "@ember/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/lib/routes";

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="w-52 shrink-0">
      <ul className="space-y-1">
        {SETTINGS_SECTIONS.map((section) => {
          const current = pathname === `/settings/${section.slug}`;
          return (
            <li key={section.slug}>
              <Link
                href={`/settings/${section.slug}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-control px-3 py-2 text-sm transition-instant",
                  current
                    ? "bg-iris-wash font-medium text-iris-ink"
                    : "text-smoke hover:text-iris-ink",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
