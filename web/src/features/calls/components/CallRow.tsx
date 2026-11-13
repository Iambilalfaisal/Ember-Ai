import type { Call } from "@ember/api";
import { StatusPill, buttonVariants, cn } from "@ember/ui";
import Link from "next/link";
import { dateTime } from "@/lib/format";
import { AWAITING_SUMMARY, callState } from "../copy";

function action(call: Call): { href: string; label: string } {
  if (call.status === "upcoming") return { href: `/calls/${call.id}/prep`, label: "Open brief" };
  if (call.outcome === AWAITING_SUMMARY)
    return { href: `/calls/${call.id}/review`, label: "Review summary" };
  return { href: `/calls/${call.id}`, label: "Open call" };
}

export function CallRow({ call }: { call: Call }) {
  const state = callState(call);
  const go = action(call);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div className="w-36 shrink-0 text-sm text-smoke">{dateTime(call.startsAt)}</div>
      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate text-sm font-medium text-coal">{call.company}</p>
        <p className="truncate text-sm text-smoke">{call.title}</p>
        {call.outcome && call.outcome !== AWAITING_SUMMARY ? (
          <p className="mt-0.5 max-w-[72ch] text-detail text-smoke">{call.outcome}</p>
        ) : null}
      </div>
      <StatusPill tone={state.tone}>{state.label}</StatusPill>
      <Link
        href={go.href}
        aria-label={`${go.label} for ${call.company}, ${call.title}`}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
      >
        {go.label}
      </Link>
    </li>
  );
}
