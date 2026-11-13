"use client";

import { useRevival } from "@ember/api";
import { EmptyState, ErrorState, Skeleton, buttonVariants, cn } from "@ember/ui";
import Link from "next/link";
import { plural, shortDate } from "@/lib/format";

export function RevivalScreen() {
  const { data, isPending, isError, refetch } = useRevival();

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the Revival queue"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div>
      {data.items.length === 0 ? (
        <EmptyState
          title="No opportunities to reopen"
          description="Older opportunities with a reason to come back appear here, each with a suggested way in."
        />
      ) : (
        <ul className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
          {data.items.map(({ deal, contact, originalNeed, wayBackIn }) => (
            <li key={deal.id} className="px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-coal">{deal.company}</h2>
                  <p className="text-sm text-smoke">
                    {contact.name}, {contact.title}. Last activity{" "}
                    <span className="tabular-nums">{shortDate(deal.lastActivityAt)}</span>.
                  </p>
                </div>
                <Link
                  href={`/deals/${deal.id}`}
                  aria-label={`Open ${deal.company}`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  Open opportunity
                </Link>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-detail text-smoke">What they needed</dt>
                  <dd className="mt-0.5 text-sm text-coal">{originalNeed}</dd>
                </div>
                <div>
                  <dt className="text-detail text-smoke">A way back in</dt>
                  <dd className="mt-0.5 text-sm text-coal">{wayBackIn}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {data.excludedCount > 0 ? (
        <p className="mt-4 text-detail text-smoke">
          {plural(data.excludedCount, "opportunity", "opportunities")} left out because the contact
          declined or opted out.
        </p>
      ) : null}
    </div>
  );
}
