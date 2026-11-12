"use client";

import { useBrief, useCall } from "@ember/api";
import { ErrorState, Skeleton, buttonVariants, cn } from "@ember/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { CallHeader } from "../components/CallHeader";

function Section({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <section aria-label={title}>
      <h3 className="text-detail text-smoke">{title}</h3>
      <List className={cn("mt-1 space-y-1 text-sm text-coal", ordered && "list-decimal pl-5")}>
        {items.map((item) => (
          <li key={item} className="max-w-[72ch]">
            {item}
          </li>
        ))}
      </List>
    </section>
  );
}

export function BriefScreen({ callId }: { callId: string }) {
  const call = useCall(callId);
  const brief = useBrief(callId);

  if (call.isPending || brief.isPending) {
    return (
      <div className="max-w-3xl space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (call.isError || brief.isError) {
    return (
      <ErrorState
        title="Couldn't load the call brief"
        description="Check your connection and try again."
        onRetry={() => {
          void call.refetch();
          void brief.refetch();
        }}
      />
    );
  }

  const { call: info } = call.data;
  const b = brief.data;
  const startable = info.status === "upcoming" && info.scenarioId !== null;
  const action: ReactNode = startable ? (
    <Link href={`/live/${info.id}`} className={cn(buttonVariants({ variant: "primary" }))}>
      Start call
    </Link>
  ) : info.status === "completed" ? (
    <Link href={`/calls/${info.id}`} className={cn(buttonVariants({ variant: "secondary" }))}>
      Open call
    </Link>
  ) : (
    <p className="text-detail text-smoke">
      Live assistance is only scripted for the Blue Harbor call in this demo.
    </p>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <CallHeader call={info} />
      <section aria-label="Account summary">
        <h3 className="text-detail text-smoke">Where things stand</h3>
        <p className="mt-1 max-w-[72ch] text-sm text-coal">{b.accountSummary}</p>
      </section>
      <Section title="Open questions" items={b.openQuestions} />
      <Section title="Commitments owed" items={b.commitments} />
      <Section title="Objections to expect" items={b.likelyObjections} />
      <Section title="Plan for the call" items={b.agenda} ordered />
      <div className="border-t border-cinder pt-4">{action}</div>
    </div>
  );
}
