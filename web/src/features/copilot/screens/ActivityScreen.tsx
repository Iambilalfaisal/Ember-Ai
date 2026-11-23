"use client";

import { useAudit } from "@ember/api";
import { EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { ActivityList } from "../components/ActivityList";

/** Everything the copilot changed, and who said yes. This is the trail an admin or auditor reads. */
export function ActivityScreen() {
  const { data, isPending, isError, refetch } = useAudit({ limit: 200 });
  const [filter, setFilter] = useState<"all" | "copilot" | "manual">("all");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Copilot"
        heading="Activity"
        description="Every change Ember made on a deal, who approved it and when. Nothing is applied without a name on it."
        actions={
          <Segmented
            label="Show"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "all", label: "Everything" },
              { value: "copilot", label: "Suggested by Ember" },
              { value: "manual", label: "Done by hand" },
            ]}
          />
        }
      />
      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load the activity"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        (() => {
          const entries = data.filter((e) => filter === "all" || e.via === filter);
          return entries.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              description="Approve a suggestion or send a follow-up and it will show up in this log."
            />
          ) : (
            <div data-tour="copilot-audit">
              <ActivityList entries={entries} label="Activity log" />
            </div>
          );
        })()
      )}
    </div>
  );
}
