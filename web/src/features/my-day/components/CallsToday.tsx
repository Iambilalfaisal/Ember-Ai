import type { Call } from "@ember/api";
import { buttonVariants, cn } from "@ember/ui";
import { Phone } from "lucide-react";
import Link from "next/link";
import { clockTime } from "@/lib/format";

/** Today's calls, above the working list, because they have a time and the list does not. */
export function CallsToday({ calls }: { calls: Call[] }) {
  if (calls.length === 0) return null;
  return (
    <section aria-labelledby="calls-today">
      <h2 id="calls-today" className="text-base font-semibold text-coal">
        Calls today
      </h2>
      <ul className="mt-2 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
        {calls.map((call) => (
          <li key={call.id} className="flex items-center justify-between gap-4 px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-iris-wash text-iris-ink"
              >
                <Phone className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-coal">
                  <span className="font-semibold tabular-nums">{clockTime(call.startsAt)}</span>{" "}
                  {call.company}
                </p>
                <p className="truncate text-detail text-smoke">{call.title}</p>
              </div>
            </div>
            <Link
              href={`/calls/${call.id}/prep`}
              aria-label={`Open the brief for ${call.company}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Open brief
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
