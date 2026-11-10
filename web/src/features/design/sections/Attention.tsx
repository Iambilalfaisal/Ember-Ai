import {
  HeatIndicator,
  ReasonLine,
  Skeleton,
  StageBadge,
  StatusPill,
  SuggestedAction,
} from "@ember/ui";
import { Component, Section, State } from "../layout";

export function Attention() {
  return (
    <Section id="attention" title="Attention">
      <Component
        name="HeatIndicator"
        note="Warm is a filled dot with a glow-ink outline, cooling is a frost dot, cold is a hollow ring. The label is always available to screen readers."
      >
        <State label="Warm">
          <HeatIndicator heat="warm" showLabel lastActivity="Replied yesterday" />
        </State>
        <State label="Cooling">
          <HeatIndicator heat="cooling" showLabel lastActivity="Discovery call 4 days ago" />
        </State>
        <State label="Cold">
          <HeatIndicator heat="cold" showLabel lastActivity="No reply in 9 days" />
        </State>
        <State label="Dot only, in a list row">
          <p className="flex items-center gap-3 text-sm">
            <HeatIndicator heat="cooling" lastActivity="Discovery call 4 days ago" />
            Meridian Robotics
          </p>
        </State>
      </Component>

      <Component name="ReasonLine and SuggestedAction">
        <State label="Default">
          <div className="max-w-2xl space-y-4">
            <ReasonLine>
              Tom asked about the integration timeline on the last call. No reply yet.
            </ReasonLine>
            <SuggestedAction action="Share the ROI case study" actionLabel="View draft" />
          </div>
        </State>
      </Component>

      <Component name="StageBadge and StatusPill" note="Overdue is the only pill that uses flare.">
        <State label="Stage">
          <div className="flex flex-wrap gap-2">
            <StageBadge stage="Discovery" />
            <StageBadge stage="Proposal" />
            <StageBadge stage="Negotiation" />
          </div>
        </State>
        <State label="Status">
          <div className="flex flex-wrap gap-2">
            <StatusPill>Draft</StatusPill>
            <StatusPill tone="attention">Needs approval</StatusPill>
            <StatusPill tone="done">Handled</StatusPill>
            <StatusPill tone="overdue">6 days over</StatusPill>
          </div>
        </State>
      </Component>

      <Component name="Loading" note="A still placeholder in the shape of the row. No shimmer.">
        <State label="List row">
          <div
            className="flex h-14 max-w-2xl items-center gap-3"
            role="status"
            aria-label="Loading your list"
          >
            <Skeleton className="size-2.5 rounded-pill" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
          </div>
        </State>
      </Component>
    </Section>
  );
}
