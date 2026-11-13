import { CircleAlert, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../primitives/button";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[56ch] items-start gap-4 rounded-panel border border-dashed border-cinder bg-paper/60 p-6",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-iris-wash text-iris-ink"
      >
        <Sparkles className="size-5" />
      </span>
      <div>
        <h3 className="text-base text-coal">{title}</h3>
        <p className="mt-1 text-sm text-smoke">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex max-w-[56ch] gap-3 rounded-panel border border-flare/40 bg-paper p-6",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-flare" />
      <div>
        <h3 className="text-base text-coal">{title}</h3>
        <p className="mt-1 text-sm text-smoke">{description}</p>
        {onRetry ? (
          <Button className="mt-4" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
