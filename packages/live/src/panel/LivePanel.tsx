"use client";

import {
  AnswerCard,
  CallTimer,
  ConsentStatus,
  ContradictionAlert,
  ListeningIndicator,
  NextQuestion,
  NotConfirmedCard,
  ObjectionCard,
  ShareStatus,
  TranscriptStream,
  cn,
} from "@ember/ui";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isMainCard, type LiveCard, type LiveState } from "../state/reducer";
import type { Verdict } from "../session/types";

export const LIVE_PANEL_MIN_WIDTH_PX = 380;

const KIND_LABEL: Record<LiveCard["kind"], string> = {
  answer: "Answer",
  not_confirmed: "Not confirmed",
  objection: "Objection",
  contradiction: "Changed from earlier",
  next_question: "Ask next",
};

function CardView({
  card,
  onFeedback,
}: {
  card: LiveCard;
  onFeedback: (cardId: string, verdict: Verdict) => void;
}): ReactNode {
  switch (card.kind) {
    case "answer":
      return (
        <AnswerCard
          answer={card.text}
          source={card.source ?? undefined}
          ignite={card.streaming}
          feedback={card.verdict}
          onFeedback={(verdict) => onFeedback(card.id, verdict)}
        />
      );
    case "not_confirmed":
      return <NotConfirmedCard holdingLine={card.text} />;
    case "objection":
      return (
        <ObjectionCard
          objection={card.objection ?? ""}
          response={card.text}
          {...(card.source ? { source: card.source } : {})}
        />
      );
    case "contradiction":
      return <ContradictionAlert earlier={card.earlier ?? ""} now={card.now ?? ""} />;
    case "next_question":
      return null;
  }
}

/** Earlier cards, one line each, so the current card stays the hero. */
function History({
  cards,
  onFeedback,
}: {
  cards: LiveCard[];
  onFeedback: (cardId: string, verdict: Verdict) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (cards.length === 0) return null;
  return (
    <section aria-label="Earlier cards">
      <h3 className="text-detail text-smoke">Earlier on this call</h3>
      <ul className="mt-1 divide-y divide-cinder border-y border-cinder">
        {[...cards].reverse().map((card) => {
          const expanded = open === card.id;
          return (
            <li key={card.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : card.id)}
                className="flex h-11 w-full items-center gap-3 text-left text-detail transition-instant hover:text-smoke"
              >
                <span className="shrink-0 font-medium text-coal">{KIND_LABEL[card.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-smoke">{card.text}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
                />
              </button>
              {expanded ? (
                <div className="pb-3">
                  <CardView card={card} onFeedback={onFeedback} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The call assistant. The newest card is the hero, earlier ones collapse into a history, the next
 * question has its own place and the transcript sits below in smaller text.
 */
export function LivePanel({
  state,
  elapsedSec,
  paused = false,
  onFeedback,
  onAsked,
  className,
}: {
  state: LiveState;
  elapsedSec: number;
  paused?: boolean;
  onFeedback: (cardId: string, verdict: Verdict) => void;
  onAsked: (cardId: string) => void;
  className?: string;
}) {
  const main = state.cards.filter(isMainCard);
  const hero = main.at(-1);
  const earlier = main.slice(0, -1);
  const nextQuestion = state.cards.findLast((card) => card.kind === "next_question");

  return (
    <aside
      aria-label="Call assistant"
      className={cn(
        "flex h-full min-h-0 w-full min-w-[380px] max-w-[400px] flex-col gap-4 border-l border-cinder bg-paper p-4",
        className,
      )}
    >
      <header className="space-y-1.5">
        <div className="flex items-center justify-between">
          <ListeningIndicator state={paused ? "paused" : "listening"} />
          <CallTimer seconds={elapsedSec} />
        </div>
        <ShareStatus hidden />
        <ConsentStatus status="confirmed" />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {hero ? (
          <section aria-label="Current card" aria-live="polite">
            <CardView card={hero} onFeedback={onFeedback} />
          </section>
        ) : (
          <p className="text-sm text-smoke">
            Listening. Answers appear here when the client asks a question.
          </p>
        )}
        {nextQuestion ? (
          <NextQuestion
            question={nextQuestion.text}
            asked={nextQuestion.asked}
            onAsked={() => onAsked(nextQuestion.id)}
          />
        ) : null}
        <History cards={earlier} onFeedback={onFeedback} />
      </div>

      <TranscriptStream
        label="Transcript"
        className="h-44 shrink-0 border-t border-cinder pt-3"
        lines={state.transcript.map((line) => ({
          id: line.id,
          speaker: line.speaker,
          name: line.name,
          text: line.text,
        }))}
      />
    </aside>
  );
}
