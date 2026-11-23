import type { AuditEntry } from "@ember/api";
import { cn } from "@ember/ui";
import Link from "next/link";
import { dateTime } from "@/lib/format";
import { ACTION_META } from "../copy";

/** What changed, who approved it and whether Ember proposed it. */
export function ActivityList({ entries, label }: { entries: AuditEntry[]; label: string }) {
  return (
    <ol
      aria-label={label}
      className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card"
    >
      {entries.map((entry) => {
        const { Icon, label: action } = ACTION_META[entry.action];
        return (
          <li key={entry.id} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-control",
                entry.via === "copilot" ? "bg-iris-wash text-iris-ink" : "bg-ash text-smoke",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-coal">
                <span className="font-medium">{action}</span>
                <span className="text-smoke"> · </span>
                <Link
                  href={`/deals/${entry.dealId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {entry.company}
                </Link>
              </p>
              <p className="text-sm text-smoke">{entry.summary}</p>
              <p className="mt-0.5 text-detail text-smoke">
                {entry.via === "copilot"
                  ? `Suggested by Ember, approved by ${entry.approvedBy}`
                  : `Done by ${entry.approvedBy}`}
                {" · "}
                {dateTime(entry.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
