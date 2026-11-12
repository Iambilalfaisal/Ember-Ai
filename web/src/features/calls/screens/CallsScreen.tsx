"use client";

import { useCalls } from "@ember/api";
import { EmptyState, ErrorState, Input, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { CallRow } from "../components/CallRow";
import { STATUS_FILTERS, type StatusFilter } from "../copy";

export function CallsScreen() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const { data, isPending, isError, refetch } = useCalls({
    ...(status !== "all" && { status }),
    ...(q.trim() && { q: q.trim() }),
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Show calls"
          value={status}
          onValueChange={setStatus}
          options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <Input
          type="search"
          aria-label="Search calls"
          placeholder="Search by company or title"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-64"
        />
      </div>
      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load your calls"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No calls match"
          description="Change the filter or clear the search. Calls you finish appear here with their summary."
        />
      ) : (
        <ul aria-label="Calls" className="divide-y divide-cinder border-y border-cinder">
          {data.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}
