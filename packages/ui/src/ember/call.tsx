"use client";

import { ArrowDown, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/button";

export function ListeningIndicator({
  state = "listening",
  className,
}: {
  state?: "listening" | "paused";
  className?: string;
}) {
  const listening = state === "listening";
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2 text-sm text-coal", className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 rounded-pill",
          listening ? "ember-breathe border border-glow-ink bg-glow" : "border-2 border-smoke",
        )}
      />
      {listening ? "Listening" : "Paused"}
    </span>
  );
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CallTimer({ seconds, className }: { seconds: number; className?: string }) {
  return (
    <time
      dateTime={`PT${Math.floor(seconds / 60)}M${Math.floor(seconds % 60)}S`}
      className={cn("text-sm tabular-nums text-smoke", className)}
    >
      <span className="sr-only">Call time </span>
      {formatDuration(seconds)}
    </time>
  );
}

export function ShareStatus({ hidden, className }: { hidden: boolean; className?: string }) {
  const Icon = hidden ? EyeOff : Eye;
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-detail text-coal", className)}>
      <Icon aria-hidden="true" className={cn("size-3.5", hidden ? "text-moss" : "text-smoke")} />
      {hidden ? "Hidden from screen share" : "Visible when you share your screen"}
    </p>
  );
}

const consentText = {
  confirmed: "Recording consent confirmed",
  waiting: "Waiting for recording consent",
  declined: "Recording consent declined",
} as const;

export function ConsentStatus({
  status,
  className,
}: {
  status: keyof typeof consentText;
  className?: string;
}) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-detail text-coal", className)}>
      <ShieldCheck
        aria-hidden="true"
        className={cn("size-3.5", status === "confirmed" ? "text-moss" : "text-smoke")}
      />
      {consentText[status]}
    </p>
  );
}

export type TranscriptLine = {
  id: string;
  speaker: "client" | "rep";
  name: string;
  text: string;
};

/** Speaker-separated transcript. It follows the call until the user scrolls up, then offers Jump to live. */
export function TranscriptStream({
  lines,
  label = "Transcript",
  className,
}: {
  lines: TranscriptLine[];
  label?: string;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const el = scroller.current;
    if (pinned && el) el.scrollTop = el.scrollHeight;
  }, [lines.length, pinned]);

  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        ref={scroller}
        role="log"
        aria-label={label}
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="h-full overflow-y-auto"
      >
        <ol className="space-y-3 pr-2">
          {lines.map((line) => (
            <li key={line.id}>
              <p className="text-xs font-medium text-smoke">{line.name}</p>
              <p
                className={cn(
                  "text-detail",
                  line.speaker === "client" ? "text-coal" : "text-smoke",
                )}
              >
                {line.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
      {!pinned ? (
        <Button
          variant="primary"
          size="sm"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-float"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTop = el.scrollHeight;
            setPinned(true);
          }}
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
          Jump to live
        </Button>
      ) : null}
    </div>
  );
}
