"use client";

import { Check, FileText, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/overlays";
import { StreamedText } from "./streaming";

export type Source = {
  title: string;
  version: string;
  section: string;
  /** The passage the answer rests on. */
  passage: string;
};

/** Document title, version and section. Opens the passage in a popover. */
export function SourceChip({ source }: { source: Source }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-pill border border-cinder bg-paper px-2.5 text-detail text-coal transition-instant hover:border-smoke"
        >
          <FileText aria-hidden="true" className="size-3.5 shrink-0 text-smoke" />
          <span className="truncate">
            {source.title} {source.version}, {source.section}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-detail text-smoke">
          {source.title} {source.version}, {source.section}
        </p>
        <blockquote className="mt-2 border-l-2 border-cinder pl-3 text-sm text-coal">
          {source.passage}
        </blockquote>
      </PopoverContent>
    </Popover>
  );
}

function Card({
  edge,
  ignite = false,
  label,
  children,
  className,
}: {
  edge: "glow" | "frost" | "smoke";
  ignite?: boolean;
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  const edgeColour = { glow: "bg-glow", frost: "bg-frost", smoke: "bg-smoke" }[edge];
  return (
    <article
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-panel border border-cinder bg-paper py-4 pl-5 pr-4",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          edgeColour,
          ignite && "ember-ignite-edge",
        )}
      />
      {children}
    </article>
  );
}

export type Feedback = "useful" | "wrong";

/** The live answer: the largest reading text in the product, with the ignite edge as it arrives. */
export function AnswerCard({
  answer,
  source,
  streaming = false,
  ignite = streaming,
  feedback: controlled,
  onFeedback,
  className,
}: {
  answer: string;
  source?: Source | undefined;
  /** True when the card has just arrived: the edge ignites and the text streams in. */
  streaming?: boolean;
  /** Ignite the edge without streaming the text, for text that is already arriving piece by piece. */
  ignite?: boolean;
  feedback?: Feedback | null;
  onFeedback?: (feedback: Feedback) => void;
  className?: string;
}) {
  const [own, setOwn] = useState<Feedback | null>(null);
  const feedback = controlled === undefined ? own : controlled;
  const choose = (next: Feedback) => {
    setOwn(next);
    onFeedback?.(next);
  };

  return (
    <Card edge="glow" ignite={ignite} label="Answer" className={className}>
      <p className="max-w-[60ch] text-lg font-medium leading-[1.45] text-coal">
        <StreamedText key={answer} text={answer} enabled={streaming} />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {source ? <SourceChip source={source} /> : null}
        <div className="flex items-center gap-1" role="group" aria-label="Was this answer right?">
          {feedback ? (
            <p role="status" className="flex items-center gap-1.5 text-detail text-coal">
              <Check aria-hidden="true" className="size-3.5 text-moss" />
              {feedback === "useful" ? "Marked useful" : "Marked wrong"}
            </p>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => choose("useful")}>
                Useful
              </Button>
              <Button variant="ghost" size="sm" onClick={() => choose("wrong")}>
                Wrong
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Shown when nothing in the knowledge base confirms the answer. The rep gets a line to say instead. */
export function NotConfirmedCard({
  holdingLine,
  note = "The question was added to your follow-ups.",
  className,
}: {
  holdingLine: string;
  note?: string;
  className?: string;
}) {
  return (
    <Card edge="frost" label="Not confirmed" className={className}>
      <p className="text-detail font-medium text-coal">Not confirmed</p>
      <p className="mt-1 max-w-[60ch] text-lg font-medium leading-[1.45] text-coal">
        &ldquo;{holdingLine}&rdquo;
      </p>
      <p className="mt-2 text-detail text-smoke">{note}</p>
    </Card>
  );
}

export function ObjectionCard({
  objection,
  response,
  source,
  className,
}: {
  objection: string;
  response: string;
  source?: Source;
  className?: string;
}) {
  return (
    <Card edge="smoke" label="Objection" className={className}>
      <p className="text-detail text-smoke">Objection heard</p>
      <p className="max-w-[60ch] text-sm text-coal">&ldquo;{objection}&rdquo;</p>
      <p className="mt-3 text-detail text-smoke">Suggested response</p>
      <p className="max-w-[60ch] text-sm font-medium text-coal">{response}</p>
      {source ? (
        <div className="mt-3">
          <SourceChip source={source} />
        </div>
      ) : null}
    </Card>
  );
}

export function ContradictionAlert({
  earlier,
  now,
  className,
}: {
  earlier: string;
  now: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("rounded-panel border border-cinder bg-paper py-3 pl-4 pr-4", className)}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-coal">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-smoke" />
        This differs from what was said earlier
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-smoke">Earlier</dt>
        <dd className="text-coal">{earlier}</dd>
        <dt className="text-smoke">Now</dt>
        <dd className="text-coal">{now}</dd>
      </dl>
    </div>
  );
}

export function NextQuestion({
  question,
  asked: controlled,
  onAsked,
  className,
}: {
  question: string;
  asked?: boolean;
  onAsked?: () => void;
  className?: string;
}) {
  const [own, setOwn] = useState(false);
  const asked = controlled ?? own;
  return (
    <div className={cn("flex flex-wrap items-start gap-x-3 gap-y-1", className)}>
      <MessageCircleQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-smoke" />
      <div className="min-w-[11rem] flex-1">
        <p className="text-detail text-smoke">Ask next</p>
        <p className="max-w-[60ch] text-sm font-medium text-coal">{question}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={asked}
        onClick={() => {
          setOwn(true);
          onAsked?.();
        }}
      >
        {asked ? "Marked as asked" : "Mark as asked"}
      </Button>
    </div>
  );
}
