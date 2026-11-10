"use client";

import {
  DemoBadge,
  DraftComposer,
  EmptyState,
  ErrorState,
  ExtractedField,
  MetricTile,
  TrendChart,
  Button,
  type DraftStatus,
} from "@ember/ui";
import { useState } from "react";
import { Component, Section, State } from "../layout";

export function Working() {
  const [body, setBody] = useState(
    "Hi Tom,\n\nThanks for the call today. Integration runs in three phases over six to eight weeks, starting with the ERP connector. I'll send the ROI case study this afternoon.\n\nSam",
  );
  const [status, setStatus] = useState<DraftStatus>("draft");
  const [next, setNext] = useState("Send the ROI case study");

  return (
    <>
      <Section id="working" title="Working with extracted details">
        <Component name="ExtractedField" note="Enter saves, Escape cancels.">
          <State label="Default">
            <div className="max-w-xl">
              <ExtractedField label="Next action" value={next} onSave={setNext} />
              <ExtractedField label="Blocker" value="Waiting on the data migration owner" />
            </div>
          </State>
        </Component>

        <Component name="DraftComposer" note="Send becomes Sent, and the draft locks.">
          <State label={status === "sent" ? "Sent" : "Draft"}>
            <DraftComposer
              body={body}
              onBodyChange={setBody}
              facts={["Integration timeline", "ERP connector first", "ROI case study"]}
              status={status}
              onSend={() => setStatus("sent")}
            />
            {status === "sent" ? (
              <Button className="mt-3" size="sm" onClick={() => setStatus("draft")}>
                Reset draft
              </Button>
            ) : null}
          </State>
        </Component>
      </Section>

      <Section id="numbers" title="Numbers">
        <Component
          name="MetricTile and TrendChart"
          note="A figure with its label, not a card. Tiles are for the pipeline board."
        >
          <State label="Default">
            <div className="grid max-w-2xl gap-6 md:grid-cols-[1fr_1fr_auto]">
              <MetricTile label="Need you today" value="4" note="2 calls" />
              <MetricTile
                label="Follow-ups sent this week"
                value="18"
                note="6 more than last week"
              />
              <TrendChart
                data={[3, 5, 4, 7, 6, 9, 12]}
                summary="Follow-ups sent per day this week, rising from 3 to 12."
              />
            </div>
          </State>
        </Component>
      </Section>

      <Section id="states" title="Empty, error and demo states">
        <Component name="EmptyState">
          <State label="My Day">
            <EmptyState
              title="Nothing needs you right now"
              description="New items appear after tomorrow's 7:00 check."
            />
          </State>
        </Component>
        <Component name="ErrorState">
          <State label="List failed to load">
            <ErrorState
              title="Couldn't load your list"
              description="Check your connection and try again."
              onRetry={() => {}}
            />
          </State>
        </Component>
        <Component name="DemoBadge">
          <State label="Top bar, mock mode">
            <DemoBadge />
          </State>
        </Component>
      </Section>
    </>
  );
}
