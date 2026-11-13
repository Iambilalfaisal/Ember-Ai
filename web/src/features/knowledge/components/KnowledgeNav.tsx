"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ember/ui";

const LINKS = [
  { href: "/knowledge", label: "Documents" },
  { href: "/knowledge/test", label: "Test console" },
];

export function KnowledgeNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Knowledge base" className="flex gap-1 border-b border-cinder">
      {LINKS.map((link) => {
        const current = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-instant",
              current
                ? "border-iris font-medium text-iris-ink"
                : "border-transparent text-smoke hover:text-coal",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
