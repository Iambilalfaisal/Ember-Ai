"use client";

import { useDeals, useMe, useUpdateDeal, type Deal, type Stage, type User } from "@ember/api";
import { EmptyState, ErrorState, Input, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { toast } from "sonner";
import { STAGE_LABEL } from "@/lib/stages";
import { useUserMap } from "@/lib/useUserMap";
import { DealsTable } from "../components/DealsTable";
import { PipelineBoard } from "../components/PipelineBoard";

const selectClass =
  "h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris";

// A rep only ever sees their own deals, so owner initials on every tile would add nothing.
const noOwners = new Map<string, User>();

export function PipelineScreen() {
  const [view, setView] = useState<"board" | "list">("board");
  const [ownerId, setOwnerId] = useState("all");
  const [q, setQ] = useState("");
  // Where a deal was just dropped, shown at once while the change is saved.
  const [moved, setMoved] = useState<Record<string, Stage>>({});
  const { data: me } = useMe();
  const { users, byId } = useUserMap();
  const update = useUpdateDeal();
  const { data, isPending, isError, refetch } = useDeals({
    ...(ownerId !== "all" && { ownerId }),
    ...(q.trim() && { q: q.trim() }),
  });

  const deals: Deal[] | undefined = data?.map((deal) => {
    const stage = moved[deal.id];
    return stage ? { ...deal, stage } : deal;
  });

  const move = (deal: Deal, stage: Stage) => {
    setMoved((current) => ({ ...current, [deal.id]: stage }));
    update.mutate(
      { id: deal.id, body: { stage } },
      {
        onSuccess: () => toast(`${deal.company} moved to ${STAGE_LABEL[stage]}.`),
        onError: () => toast.error(`Couldn't move ${deal.company}. Try again.`),
        onSettled: () =>
          setMoved((current) =>
            Object.fromEntries(Object.entries(current).filter(([id]) => id !== deal.id)),
          ),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: "board", label: "Board" },
            { value: "list", label: "List" },
          ]}
        />
        {me && me.role !== "rep" ? (
          <label className="flex items-center gap-2 text-detail text-smoke">
            Owner
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              className={selectClass}
            >
              <option value="all">Everyone</option>
              <option value="none">Unassigned</option>
              {users
                .filter((user) => user.role === "rep")
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <Input
          type="search"
          aria-label="Search opportunities"
          placeholder="Search by company"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="w-56"
        />
      </div>

      {isPending ? (
        <div className="grid grid-cols-6 gap-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load the pipeline"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : deals && deals.length === 0 ? (
        <EmptyState
          title="No opportunities match"
          description="Clear the search or change the owner to see more of the pipeline."
        />
      ) : deals && view === "board" ? (
        <PipelineBoard deals={deals} owners={me?.role === "rep" ? noOwners : byId} onMove={move} />
      ) : deals ? (
        <DealsTable deals={deals} owners={byId} />
      ) : null}
    </div>
  );
}
