import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/button";
import { Tooltip } from "../primitives/overlays";

export type Heat = "warm" | "cooling" | "cold";

export const HEAT_LABEL: Record<Heat, string> = { warm: "Warm", cooling: "Cooling", cold: "Cold" };

// Shape and fill differ as well as colour, so the state never depends on colour alone.
// The warm dot carries a glow-ink outline: glow on white is only 2.2:1 (see tokens.test.ts).
const dotStyle: Record<Heat, string> = {
  warm: "border border-glow-ink bg-glow",
  cooling: "border border-frost bg-frost",
  cold: "border-2 border-smoke bg-transparent",
};

export function HeatIndicator({
  heat,
  showLabel = false,
  lastActivity,
  className,
}: {
  heat: Heat;
  showLabel?: boolean;
  /** Plain-language last meaningful activity, shown in a tooltip. */
  lastActivity?: string;
  className?: string;
}) {
  const content = (
    <span
      className={cn("inline-flex items-center gap-2 text-detail text-coal", className)}
      tabIndex={lastActivity ? 0 : undefined}
    >
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-pill", dotStyle[heat])} />
      <span className={showLabel ? undefined : "sr-only"}>{HEAT_LABEL[heat]}</span>
    </span>
  );
  if (!lastActivity) return content;
  return <Tooltip content={`Last meaningful activity: ${lastActivity}`}>{content}</Tooltip>;
}

/** The plain-language reason an item needs attention. */
export function ReasonLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[72ch] text-sm text-coal", className)}>{children}</p>;
}

export function SuggestedAction({
  action,
  actionLabel,
  onAct,
  className,
}: {
  action: string;
  actionLabel: string;
  onAct?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <p className="text-detail text-smoke">Suggested next step</p>
        <p className="max-w-[72ch] text-sm font-medium text-coal">{action}</p>
      </div>
      <Button variant="primary" size="sm" onClick={onAct}>
        {actionLabel}
      </Button>
    </div>
  );
}
