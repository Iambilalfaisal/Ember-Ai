"use client";

import { useTeam, useUpdateDeal, type TeamRow } from "@ember/api";
import {
  EmptyState,
  ErrorState,
  Input,
  Segmented,
  Skeleton,
  StageBadge,
  StatusPill,
} from "@ember/ui";
import { useState } from "react";
import { toast } from "sonner";
import { shortDate } from "@/lib/format";
import { STATUS_FILTERS, STATUS_LABEL, STATUS_TONE, type StatusFilter } from "../copy";

const selectClass =
  "h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris";

export function TeamScreen() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [ownerId, setOwnerId] = useState("all");
  const [q, setQ] = useState("");
  const { data, isPending, isError, refetch } = useTeam({
    ...(status !== "all" && { status }),
    ...(ownerId !== "all" && { ownerId }),
    ...(q.trim() && { q: q.trim() }),
  });
  const update = useUpdateDeal();

  const assign = (row: TeamRow, ownerId: string) => {
    const owner = data?.reps.find((rep) => rep.id === ownerId);
    update.mutate(
      { id: row.deal.id, body: { ownerId: ownerId === "none" ? null : ownerId } },
      {
        onSuccess: () =>
          toast(
            owner
              ? `${row.deal.company} assigned to ${owner.name}.`
              : `${row.deal.company} is unassigned.`,
          ),
        onError: () => toast.error("Couldn't change the owner. Try again."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Status"
          value={status}
          onValueChange={setStatus}
          options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <label className="flex items-center gap-2 text-detail text-smoke">
          Rep
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className={selectClass}
          >
            <option value="all">All reps</option>
            <option value="none">Unassigned</option>
            {data?.reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
        </label>
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
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load the team"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Change the filters, or clear the search, to see more opportunities."
        />
      ) : (
        <div className="ember-table-card">
          <table className="ember-table w-full min-w-[56rem] border-collapse text-left text-sm">
            <caption className="sr-only">Opportunities by owner and status</caption>
            <thead>
              <tr className="border-b border-cinder text-detail text-smoke">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Opportunity
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Last interaction
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Next action
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Blocker
                </th>
                <th scope="col" className="py-2 font-medium">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cinder">
              {data.rows.map((row) => (
                <tr key={row.deal.id} className="min-h-14 align-top">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-coal">{row.deal.company}</p>
                    <StageBadge stage={row.deal.stage} className="mt-1 capitalize" />
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill tone={STATUS_TONE[row.deal.status] ?? "neutral"}>
                      {STATUS_LABEL[row.deal.status] ?? row.deal.status}
                    </StatusPill>
                    <p className="mt-1 max-w-[28ch] text-detail text-smoke">{row.reason}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-coal">{row.deal.lastActivityNote}</p>
                    <p className="text-detail tabular-nums text-smoke">
                      {shortDate(row.deal.lastActivityAt)}
                    </p>
                  </td>
                  <td className="max-w-[24ch] py-3 pr-4 text-coal">
                    {row.deal.nextAction ?? "None set"}
                  </td>
                  <td className="max-w-[24ch] py-3 pr-4 text-coal">{row.deal.blocker ?? "None"}</td>
                  <td className="py-3">
                    <select
                      aria-label={`Owner of ${row.deal.company}`}
                      value={row.owner?.id ?? "none"}
                      disabled={update.isPending}
                      onChange={(event) => assign(row, event.target.value)}
                      className={selectClass}
                    >
                      {row.owner ? null : <option value="none">Assign owner</option>}
                      {data.reps.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
