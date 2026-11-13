"use client";

import type { MyDayItem } from "@ember/api";
import { Button, HeatIndicator, ReasonLine, StageBadge, SuggestedAction } from "@ember/ui";
import { DiscoveryNotes } from "./DiscoveryNotes";

/** The right-hand pane: why this opportunity is here, what to do, and the notes behind it. */
export function ItemDetail({
  item,
  onViewDraft,
  onHandled,
  onSnooze,
  busy,
}: {
  item: MyDayItem;
  onViewDraft: () => void;
  onHandled: () => void;
  onSnooze: () => void;
  busy: boolean;
}) {
  const { deal, contact } = item;
  return (
    <article aria-label={deal.company} className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold text-coal">{deal.company}</h2>
        <p className="text-sm text-smoke">
          {contact.name}, {contact.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StageBadge stage={deal.stage} className="capitalize" />
          <HeatIndicator heat={deal.heat} showLabel lastActivity={deal.lastActivityNote} />
        </div>
      </header>

      <section aria-labelledby="why-here">
        <h3 id="why-here" className="text-detail text-smoke">
          Why it&apos;s here
        </h3>
        <ReasonLine>{item.reason}</ReasonLine>
      </section>

      {item.hasDraft ? (
        <SuggestedAction
          action={item.suggestedAction}
          actionLabel="View draft"
          onAct={onViewDraft}
        />
      ) : (
        <div>
          <p className="text-detail text-smoke">Suggested next step</p>
          <p className="max-w-[72ch] text-sm font-medium text-coal">{item.suggestedAction}</p>
        </div>
      )}

      {item.hasNotes ? <DiscoveryNotes key={deal.id} dealId={deal.id} /> : null}

      <div className="flex flex-wrap gap-2 border-t border-cinder pt-4">
        <Button variant="primary" onClick={onHandled} disabled={busy}>
          Mark handled
        </Button>
        <Button onClick={onSnooze} disabled={busy}>
          Snooze 3 days
        </Button>
      </div>
    </article>
  );
}
