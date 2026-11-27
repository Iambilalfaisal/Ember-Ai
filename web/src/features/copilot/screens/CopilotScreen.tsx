"use client";

import { useAudit, useDigest, useMe, useSuggestions, type Digest } from "@ember/api";
import {
  Aura,
  Button,
  EmptyState,
  ErrorState,
  MetricTile,
  Rise,
  Skeleton,
  Surface,
  buttonVariants,
  cn,
} from "@ember/ui";
import { ArrowRight, BellRing } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { clockTime, plural } from "@/lib/format";
import { ActivityList } from "../components/ActivityList";
import { LoopStrip } from "../components/LoopStrip";
import { PrefsDialog } from "../components/PrefsDialog";
import { SuggestionCard } from "../components/SuggestionCard";

function DigestCard({ digest, onSettings }: { digest: Digest; onSettings: () => void }) {
  const { counts, highlights, nextCall } = digest;
  return (
    <Rise
      as="section"
      aria-label="Morning digest"
      data-tour="copilot-digest"
      className="relative overflow-hidden rounded-panel border border-cinder bg-hero p-5 shadow-card sm:p-6"
    >
      <Aura />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[60ch]">
          <p className="text-detail font-medium text-iris-ink">Your morning digest</p>
          <h2 className="text-2xl text-coal">{digest.greeting}</h2>
          <p aria-live="polite" className="mt-1 text-base text-coal">
            {digest.headline}
          </p>
        </div>
        <Button size="sm" onClick={onSettings}>
          <BellRing aria-hidden="true" className="size-4" />
          Digest settings
        </Button>
      </div>

      {highlights.length > 0 ? (
        <ul aria-label="What stands out" className="relative mt-4 space-y-2">
          {highlights.map((h) => (
            <li key={h.dealId} className="flex gap-2 text-sm text-coal">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-pill bg-iris" />
              <span className="min-w-0">
                <Link
                  href={`/deals/${h.dealId}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {h.company}
                </Link>
                <span className="text-smoke">: {h.text}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <Link href="/my-day" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
          Open My Day
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {nextCall ? (
          <Link
            href={`/calls/${nextCall.id}/prep`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Brief for {nextCall.company} at {clockTime(nextCall.startsAt)}
          </Link>
        ) : null}
        <span className="text-detail text-smoke">
          {plural(counts.overdue, "next action")} overdue · {counts.noNextAction} without one
        </span>
      </div>
    </Rise>
  );
}

export function CopilotScreen() {
  const digest = useDigest();
  const suggestions = useSuggestions();
  const audit = useAudit({ limit: 5 });
  const me = useMe();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (digest.isPending || suggestions.isPending || audit.isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (digest.isError || suggestions.isError || audit.isError) {
    return (
      <ErrorState
        title="Couldn't load Copilot"
        description="Check your connection and try again."
        onRetry={() => {
          void digest.refetch();
          void suggestions.refetch();
          void audit.refetch();
        }}
      />
    );
  }

  const pending = suggestions.data.filter((s) => s.state === "pending");
  const today = new Date().toDateString();
  const changesToday = audit.data.filter((a) => new Date(a.at).toDateString() === today).length;

  return (
    <div className="space-y-6">
      <DigestCard digest={digest.data} onSettings={() => setSettingsOpen(true)} />
      {settingsOpen ? <PrefsDialog onClose={() => setSettingsOpen(false)} /> : null}

      <LoopStrip
        needYou={digest.data.counts.needYou}
        noNextAction={digest.data.counts.noNextAction}
        waiting={pending.length}
        changesToday={changesToday}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-labelledby="ember-suggests"
          className="min-w-0 space-y-3"
          data-tour="copilot-suggestions"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="ember-suggests" className="text-base font-semibold text-coal">
              Ember suggests
            </h2>
            <p className="text-detail text-smoke">{pending.length} waiting for your decision</p>
          </div>
          {suggestions.data.length === 0 ? (
            <EmptyState
              title="Nothing to suggest right now"
              description="Ember is watching. When a deal goes quiet or loses its next action, it will show up here."
            />
          ) : (
            <ul className="space-y-3">
              {suggestions.data.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} showOwner={me.data?.role !== "rep"} />
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-6 self-start">
          <section aria-label="Your day in numbers" className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Need you"
              value={String(digest.data.counts.needYou)}
              note="In My Day"
            />
            <MetricTile
              label="Calls today"
              value={String(digest.data.counts.callsToday)}
              note="With a brief"
            />
            <MetricTile
              label="To revive"
              value={String(digest.data.counts.revival)}
              note="Opted-out excluded"
            />
            <MetricTile label="Waiting on you" value={String(pending.length)} note="Suggestions" />
          </section>

          <section
            aria-labelledby="recent-activity"
            className="space-y-2"
            data-tour="copilot-activity"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="recent-activity" className="text-base font-semibold text-coal">
                Recent activity
              </h2>
              <Link
                href="/copilot/activity"
                className="text-detail text-iris-ink underline-offset-2 hover:underline"
              >
                See everything
              </Link>
            </div>
            {audit.data.length === 0 ? (
              <Surface className="p-4 text-sm text-smoke">
                Approved actions appear here, with who approved each one.
              </Surface>
            ) : (
              <ActivityList entries={audit.data} label="Recent activity" />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
