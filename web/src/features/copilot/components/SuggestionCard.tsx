"use client";

import { useApproveSuggestion, useDismissSuggestion, type Suggestion } from "@ember/api";
import { Button, StatusPill, buttonVariants, cn } from "@ember/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { dateTime } from "@/lib/format";
import { KIND_ICON, KIND_LABEL, afterApproval } from "../copy";

/** One thing the copilot noticed. It shows why, what it rests on and exactly what approving does. */
export function SuggestionCard({
  suggestion,
  showOwner = false,
}: {
  suggestion: Suggestion;
  /** A lead or admin sees the team's suggestions, so each one says whose it is. */
  showOwner?: boolean;
}) {
  const Icon = KIND_ICON[suggestion.kind];
  const approve = useApproveSuggestion();
  const dismiss = useDismissSuggestion();
  const busy = approve.isPending || dismiss.isPending;
  const next = afterApproval(suggestion.kind, suggestion.dealId);

  if (suggestion.state !== "pending") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-cinder bg-paper px-4 py-3 shadow-card">
        <p className="min-w-0 text-sm text-coal">
          <span className="font-medium">{suggestion.company}</span>
          <span className="text-smoke">
            {suggestion.state === "approved" ? ": approved. " : ": set aside. "}
            {suggestion.state === "approved" ? suggestion.proposedAction : suggestion.title}
          </span>
        </p>
        {suggestion.state === "approved" ? (
          <span className="flex items-center gap-3">
            <StatusPill tone="done">Approved</StatusPill>
            <Link
              href={next.href}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              {next.label}
            </Link>
          </span>
        ) : (
          <StatusPill>Not now</StatusPill>
        )}
      </li>
    );
  }

  return (
    <li className="rounded-panel border border-cinder bg-paper p-4 shadow-card transition-ui hover:-translate-y-px hover:shadow-lift">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-control bg-iris-wash text-iris-ink"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-detail font-medium text-iris-ink">
            {KIND_LABEL[suggestion.kind]}
            {showOwner ? (
              <span className="font-normal text-smoke">for {suggestion.ownerName}</span>
            ) : null}
          </p>
          <h3 className="text-base font-semibold text-coal">
            <Link
              href={`/deals/${suggestion.dealId}`}
              className="hover:underline underline-offset-2"
            >
              {suggestion.company}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-coal">{suggestion.title}</p>
          <p className="mt-1 max-w-[68ch] text-sm text-smoke">{suggestion.why}</p>
          <ul aria-label="What this rests on" className="mt-2 flex flex-wrap gap-1.5">
            {suggestion.facts.map((fact) => (
              <li
                key={fact}
                className="rounded-pill border border-cinder bg-ash px-2.5 py-0.5 text-detail text-coal"
              >
                {fact}
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-control border border-iris/30 bg-iris-wash px-3 py-2 text-sm text-coal">
            <span className="font-medium text-iris-ink">If you approve: </span>
            {suggestion.proposedAction}
            {suggestion.proposedDueAt ? (
              <span className="text-smoke"> · due {dateTime(suggestion.proposedDueAt)}</span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() =>
                approve.mutate(suggestion.id, {
                  onSuccess: () =>
                    toast.success(`Done for ${suggestion.company}. It is in the activity log.`),
                  onError: () => toast.error("Couldn't apply that. Try again."),
                })
              }
            >
              <Check aria-hidden="true" className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                dismiss.mutate(suggestion.id, {
                  onSuccess: () => toast(`Set aside for ${suggestion.company}.`),
                  onError: () => toast.error("Couldn't save that. Try again."),
                })
              }
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
