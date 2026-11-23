"use client";

import { useBrief, useCall, useDeal } from "@ember/api";
import { ErrorState, Skeleton, Surface, buttonVariants, cn } from "@ember/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_ROLE_LABEL } from "@/lib/contactRoles";
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
  // The people on the call and the part each plays in the decision, read from the deal's contacts.
  const deal = useDeal(call.data?.call.dealId ?? "");

  if (call.isPending || brief.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
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
    <div className="space-y-6">
      <CallHeader call={info} />
      <Surface data-tour="brief" className="grid gap-x-10 gap-y-6 p-5 lg:grid-cols-2">
        <section aria-label="Account summary" className="lg:col-span-2">
          <h3 className="text-detail text-smoke">Where things stand</h3>
          <p className="mt-1 max-w-[72ch] text-sm text-coal">{b.accountSummary}</p>
        </section>
        <section aria-label="Who is on the call" className="lg:col-span-2">
          <h3 className="text-detail text-smoke">Who is on the call</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {info.participants
              .filter((p) => p.side === "client")
              .map((p) => {
                const contact = deal.data?.contacts.find((c) => c.name === p.name);
                return (
                  <li
                    key={p.name}
                    className="rounded-control border border-cinder bg-ash px-3 py-1.5 text-sm text-coal"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-smoke"> · {p.role}</span>
                    {contact ? (
                      <span className="ml-2 rounded-pill border border-iris/40 bg-iris-wash px-2 py-0.5 text-detail text-iris-ink">
                        {CONTACT_ROLE_LABEL[contact.role]}
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
        <Section title="Open questions" items={b.openQuestions} />
        <Section title="Commitments owed" items={b.commitments} />
        <Section title="Objections to expect" items={b.likelyObjections} />
        <Section title="Plan for the call" items={b.agenda} ordered />
        <div className="border-t border-cinder pt-4 lg:col-span-2">{action}</div>
      </Surface>
    </div>
  );
}
