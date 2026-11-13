"use client";

import { AlertTriangle, Check, CircleDot, Clock, Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/button";
import { Input, Textarea } from "../primitives/input";

/** A field the assistant filled in. The rep can fix it in place: Enter saves, Escape cancels. */
export function ExtractedField({
  label,
  value,
  onSave,
  className,
}: {
  label: string;
  value: string;
  onSave?: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);

  const save = () => {
    onSave?.(draft);
    setEditing(false);
    setSaved(true);
  };

  return (
    <div className={cn("min-h-14", className)}>
      <label htmlFor={editing ? id : undefined} className="text-detail text-smoke">
        {label}
      </label>
      {editing ? (
        <div className="mt-1 flex items-center gap-2">
          <Input
            id={id}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(false);
            }}
          />
          <Button variant="primary" size="sm" onClick={save}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="max-w-[72ch] text-sm text-coal">{value}</p>
          <div className="flex items-center gap-2">
            {saved ? (
              <span role="status" className="text-detail text-smoke">
                Saved
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${label.toLowerCase()}`}
              onClick={() => {
                setDraft(value);
                setSaved(false);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export type DraftStatus = "draft" | "sent";

/** A suggested reply the rep can edit, regenerate, copy or send. Send becomes Sent. */
export function DraftComposer({
  label = "Suggested reply",
  body,
  onBodyChange,
  facts,
  status = "draft",
  onRegenerate,
  onCopy,
  onSend,
  className,
}: {
  label?: string;
  body: string;
  onBodyChange: (body: string) => void;
  facts: string[];
  status?: DraftStatus;
  onRegenerate?: () => void;
  onCopy?: () => void;
  onSend?: () => void;
  className?: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const sent = status === "sent";

  return (
    <div className={cn("space-y-3", className)}>
      <label htmlFor={id} className="text-sm font-medium text-coal">
        {label}
      </label>
      <Textarea
        id={id}
        value={body}
        readOnly={sent}
        onChange={(event) => onBodyChange(event.target.value)}
        className="min-h-40 max-w-[72ch]"
      />
      <div>
        <p className="text-detail text-smoke">Facts used</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-pill border border-transparent bg-iris-wash px-2.5 py-0.5 text-detail text-iris-ink"
            >
              {fact}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRegenerate} disabled={sent}>
          Regenerate
        </Button>
        <Button
          onClick={() => {
            onCopy?.();
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="primary" onClick={onSend} disabled={sent}>
          {sent ? "Sent" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-pill border border-transparent bg-iris-wash px-2.5 text-detail font-medium text-iris-ink",
        className,
      )}
    >
      {stage}
    </span>
  );
}

export type StatusTone = "neutral" | "done" | "attention" | "overdue";

const toneIcon: Record<StatusTone, ReactNode> = {
  neutral: <CircleDot aria-hidden="true" className="size-3.5 text-smoke" />,
  done: <Check aria-hidden="true" className="size-3.5 text-moss" />,
  attention: <Clock aria-hidden="true" className="size-3.5 text-frost" />,
  overdue: <AlertTriangle aria-hidden="true" className="size-3.5" />,
};

/** Overdue is the only tone that uses flare, and it sits on paper (flare text is 4.2:1 on ash). */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-pill border bg-paper px-2.5 text-detail font-medium shadow-card",
        tone === "overdue" ? "border-flare text-flare" : "border-cinder text-coal",
        className,
      )}
    >
      {toneIcon[tone]}
      {children}
    </span>
  );
}

/** A figure with its label, set on a card with a thin accent edge. */
export function MetricTile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-panel border border-cinder bg-paper p-4 shadow-card transition-ui hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
      <p className="text-detail text-smoke">{label}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-[-0.01em] text-coal">{value}</p>
      {note ? <p className="text-detail text-smoke">{note}</p> : null}
    </div>
  );
}

/** A small line chart with a text summary for people who cannot see it. */
export function TrendChart({
  data,
  summary,
  width = 240,
  height = 64,
  className,
}: {
  data: number[];
  summary: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((value, index) => {
    const x = pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const last = points.at(-1);
  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-16 w-60 max-w-full overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-iris)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--color-iris)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${height - pad} ${points.map(([x, y]) => `${x},${y}`).join(" ")} ${width - pad},${height - pad}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--color-iris)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last ? <circle cx={last[0]} cy={last[1]} r={3} fill="var(--color-iris)" /> : null}
    </svg>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-pill border border-transparent bg-iris-wash px-2.5 text-detail font-medium text-iris-ink",
        className,
      )}
    >
      Demo data
    </span>
  );
}
