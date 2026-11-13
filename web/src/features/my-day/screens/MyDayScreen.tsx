"use client";

import { useHandleMyDayItem, useMyDay, useSnoozeMyDayItem } from "@ember/api";
import {
  Aura,
  EmptyState,
  MetricTile,
  ErrorState,
  ReflowItem,
  ReflowList,
  Skeleton,
  buttonVariants,
  cn,
} from "@ember/ui";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DraftSheet } from "@/features/drafts";
import { clockTime, plural } from "@/lib/format";
import { CallsToday } from "../components/CallsToday";
import { ItemDetail } from "../components/ItemDetail";
import { MyDayRow } from "../components/MyDayRow";
import { countsLabel } from "../copy";

export function MyDayScreen() {
  const { data, isPending, isError, refetch } = useMyDay();
  const handle = useHandleMyDayItem();
  const snooze = useSnoozeMyDayItem();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kept whole: sending the draft clears the item from the list while the sheet still shows "Sent".
  const [draft, setDraft] = useState<{
    dealId: string;
    company: string;
    contactName: string;
  } | null>(null);

  if (isPending) return <MyDaySkeleton />;
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load your day"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const { items, counts, calls } = data;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const busy = handle.isPending || snooze.isPending;

  const overdue = items.filter((item) => item.overdueDays > 0).length;
  const drafts = items.filter((item) => item.hasDraft).length;
  const nextCall = calls[0];

  return (
    <div className="space-y-6">
      <section
        aria-label="Today at a glance"
        className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
      >
        <div className="relative flex flex-col justify-center overflow-hidden rounded-panel border border-cinder bg-hero p-6 shadow-card">
          <Aura />
          <p className="relative text-detail font-medium text-iris-ink">Today</p>
          <p aria-live="polite" className="relative mt-1 text-2xl text-coal">
            <span className="tabular-nums font-medium">{countsLabel(counts.needYou)}</span>
            <span className="text-smoke">
              , <span className="tabular-nums">{plural(counts.callsToday, "call")}</span> today
            </span>
          </p>
        </div>
        <MetricTile label="Follow-ups overdue" value={String(overdue)} note="Oldest first" />
        <MetricTile label="Drafts ready" value={String(drafts)} note="Review and send" />
        <MetricTile
          label="Next call"
          value={nextCall ? clockTime(nextCall.startsAt) : "None"}
          note={nextCall ? nextCall.company : "Nothing scheduled"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-3" data-tour="my-day-list">
          <h2 className="text-base font-semibold text-coal">Needs you today</h2>
          {items.length === 0 ? (
            <EmptyState
              title="You're clear for today"
              description="Nothing needs you right now. Older opportunities that may be worth reopening are in the Revival queue."
              action={
                <Link href="/revival" className={cn(buttonVariants({ variant: "secondary" }))}>
                  Open Revival queue
                </Link>
              }
            />
          ) : (
            <ReflowList
              aria-label="Opportunities that need you"
              className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card"
            >
              {items.map((item) => (
                <ReflowItem key={item.id}>
                  <MyDayRow
                    item={item}
                    selected={item.id === selected?.id}
                    onSelect={() => setSelectedId(item.id)}
                  />
                </ReflowItem>
              ))}
            </ReflowList>
          )}
        </div>

        <div className="min-w-0 space-y-4 self-start lg:sticky lg:top-0">
          <CallsToday calls={calls} />
          {selected ? (
            <div
              data-tour="my-day-detail"
              className="min-w-0 rounded-panel border border-cinder bg-paper p-5 shadow-card"
            >
              <ItemDetail
                key={selected.id}
                item={selected}
                busy={busy}
                onViewDraft={() =>
                  setDraft({
                    dealId: selected.deal.id,
                    company: selected.deal.company,
                    contactName: selected.contact.name,
                  })
                }
                onHandled={() =>
                  handle.mutate(selected.id, {
                    onSuccess: () => toast(`${selected.deal.company} marked handled.`),
                    onError: () => toast.error("Couldn't mark that handled. Try again."),
                  })
                }
                onSnooze={() =>
                  snooze.mutate(
                    { id: selected.id, days: 3 },
                    {
                      onSuccess: () => toast(`${selected.deal.company} snoozed for 3 days.`),
                      onError: () => toast.error("Couldn't snooze that. Try again."),
                    },
                  )
                }
              />
            </div>
          ) : null}
        </div>

        <DraftSheet
          dealId={draft?.dealId ?? null}
          company={draft?.company ?? ""}
          contactName={draft?.contactName ?? ""}
          onClose={() => setDraft(null)}
        />
      </div>
    </div>
  );
}

function MyDaySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
