"use client";

import { useHandleMyDayItem, useMyDay, useSnoozeMyDayItem } from "@ember/api";
import {
  EmptyState,
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
import { plural } from "@/lib/format";
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0 space-y-4">
        <p
          aria-live="polite"
          className="rounded-panel border border-cinder bg-hero p-4 text-base text-coal shadow-card"
        >
          <span className="tabular-nums font-medium">{countsLabel(counts.needYou)}</span>
          <span className="text-smoke">
            , <span className="tabular-nums">{plural(counts.callsToday, "call")}</span> today
          </span>
        </p>
        <CallsToday calls={calls} />
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

      {selected ? (
        <div className="min-w-0 self-start rounded-panel border border-cinder bg-paper p-5 shadow-card lg:sticky lg:top-0">
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

      <DraftSheet
        dealId={draft?.dealId ?? null}
        company={draft?.company ?? ""}
        contactName={draft?.contactName ?? ""}
        onClose={() => setDraft(null)}
      />
    </div>
  );
}

function MyDaySkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
