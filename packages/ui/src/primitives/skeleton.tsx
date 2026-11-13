import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** A placeholder with a soft shimmer. The shimmer stops under reduced motion. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("ember-shimmer rounded-control bg-cinder", className)}
      {...props}
    />
  );
}
