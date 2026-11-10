import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** A still placeholder. It stays still: the data should arrive before an animation would matter. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn("rounded-control bg-cinder", className)} {...props} />
  );
}
