import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/** A raised card. The base surface for panels, lists and forms. */
export function Surface({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-panel border border-cinder bg-paper shadow-card",
        interactive &&
          "transition-ui hover:-translate-y-0.5 hover:border-iris/40 hover:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Content that settles in with a short rise. Give `index` to stagger siblings (60 ms apart, capped).
 * Pure CSS, so it costs no JavaScript, and reduced motion turns it off.
 */
export function Rise({
  as,
  index = 0,
  className,
  style,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType; index?: number }) {
  const Tag = as ?? "div";
  const merged: CSSProperties = { animationDelay: `${Math.min(index, 8) * 60}ms`, ...style };
  return (
    <Tag className={cn("ember-rise", className)} style={merged} {...props}>
      {children}
    </Tag>
  );
}

/** A banner at the top of a page: a short heading, one line of context and the page's main actions. */
export function PageHeader({
  eyebrow,
  heading,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  heading: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Rise
      as="section"
      aria-label={heading}
      className={cn(
        "relative overflow-hidden rounded-panel border border-cinder bg-hero p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <Aura />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-[64ch]">
          {eyebrow ? <p className="text-detail font-medium text-iris-ink">{eyebrow}</p> : null}
          <h2 className="text-2xl text-coal">{heading}</h2>
          {description ? <p className="mt-1 text-sm text-smoke">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Rise>
  );
}

/** A soft drifting glow behind a banner. Decorative only. */
export function Aura({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ember-aura pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-iris/15 blur-3xl",
        className,
      )}
    />
  );
}
