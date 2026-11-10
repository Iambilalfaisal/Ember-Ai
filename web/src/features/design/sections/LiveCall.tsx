"use client";

import {
  AnswerCard,
  Button,
  CallTimer,
  ConsentStatus,
  ContradictionAlert,
  ListeningIndicator,
  NextQuestion,
  NotConfirmedCard,
  ObjectionCard,
  ShareStatus,
  SourceChip,
  TranscriptStream,
  type Source,
  type TranscriptLine,
} from "@ember/ui";
import { useState } from "react";
import { Component, Section, State } from "../layout";

const source: Source = {
  title: "Integration guide",
  version: "v3",
  section: "section 2",
  passage:
    "Integration runs in three phases over six to eight weeks. The ERP connector is built first, then data migration, then user rollout.",
};

const answer =
  "Integration runs in three phases over six to eight weeks, with the ERP connector first.";

const lines: TranscriptLine[] = [
  {
    id: "1",
    speaker: "client",
    name: "Tom Reyes",
    text: "We run SAP today. How long would integration take?",
  },
  {
    id: "2",
    speaker: "rep",
    name: "Sam Okafor",
    text: "Good question. Let me check the exact phasing.",
  },
  {
    id: "3",
    speaker: "client",
    name: "Tom Reyes",
    text: "Our go-live is in the third quarter, so timing matters.",
  },
  {
    id: "4",
    speaker: "rep",
    name: "Sam Okafor",
    text: "Understood. Six to eight weeks, starting with the ERP connector.",
  },
  {
    id: "5",
    speaker: "client",
    name: "Tom Reyes",
    text: "And who owns the data migration on our side?",
  },
  {
    id: "6",
    speaker: "rep",
    name: "Sam Okafor",
    text: "I'll confirm that and follow up in writing.",
  },
];

export function LiveCall() {
  const [arrival, setArrival] = useState(0);
  return (
    <Section id="live-call" title="Live call">
      <Component
        name="Call status"
        note="Plain words for the state of the call. Listening is the only continuous animation."
      >
        <State label="Listening">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ListeningIndicator />
            <CallTimer seconds={724} />
            <ShareStatus hidden />
            <ConsentStatus status="confirmed" />
          </div>
        </State>
        <State label="Paused, waiting">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ListeningIndicator state="paused" />
            <CallTimer seconds={65} />
            <ShareStatus hidden={false} />
            <ConsentStatus status="waiting" />
          </div>
        </State>
      </Component>

      <Component
        name="AnswerCard"
        note="The largest reading text in the product. When it arrives, a glow line sweeps down the left edge and settles as a solid 3 px edge while the text streams in."
      >
        <State label="Arriving">
          <div className="max-w-md">
            <AnswerCard key={arrival} answer={answer} source={source} streaming />
            <Button className="mt-3" size="sm" onClick={() => setArrival((n) => n + 1)}>
              Replay arrival
            </Button>
          </div>
        </State>
        <State label="Settled, with feedback">
          <div className="max-w-md">
            <AnswerCard answer={answer} source={source} />
          </div>
        </State>
        <State label="Not confirmed">
          <div className="max-w-md">
            <NotConfirmedCard holdingLine="I want to confirm that with our team and come back to you today." />
          </div>
        </State>
      </Component>

      <Component name="SourceChip" note="Opens the passage the answer rests on.">
        <State label="Default">
          <SourceChip source={source} />
        </State>
      </Component>

      <Component name="ObjectionCard, ContradictionAlert and NextQuestion">
        <State label="Objection">
          <div className="max-w-md">
            <ObjectionCard
              objection="Your price is higher than the other vendor we looked at."
              response="Ask which scope they compared. Our price includes the ERP connector and migration."
              source={{ ...source, title: "Pricing guide", section: "section 4" }}
            />
          </div>
        </State>
        <State label="Contradiction">
          <div className="max-w-md">
            <ContradictionAlert
              earlier="We can go live in 4 weeks."
              now="Integration takes 6 to 8 weeks."
            />
          </div>
        </State>
        <State label="Next question">
          <div className="max-w-md">
            <NextQuestion question="Which ERP are you on today?" />
          </div>
        </State>
      </Component>

      <Component
        name="TranscriptStream"
        note="Client lines are coal, rep lines are smoke. Scroll up and Jump to live appears."
      >
        <State label="Default">
          <TranscriptStream lines={lines} className="h-44 max-w-md" />
        </State>
        <State label="Empty">
          <p className="text-sm text-smoke">The transcript appears here once someone speaks.</p>
        </State>
      </Component>
    </Section>
  );
}
