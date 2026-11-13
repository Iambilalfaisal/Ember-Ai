import { cn } from "@ember/ui";

/** Initials on an accent wash. Colour never carries meaning here, so every avatar looks the same. */
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-pill border border-iris/30 bg-iris-wash text-detail font-medium text-iris-ink",
        className,
      )}
    >
      {initials}
    </span>
  );
}
