"use client";

import { useApproveSummary, useCall, type ApproveSummaryResult, type ApiError } from "@ember/api";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  buttonVariants,
  cn,
} from "@ember/ui";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DraftSheet } from "@/features/drafts";
import { dateTime, plural } from "@/lib/format";
import { CallHeader } from "../components/CallHeader";
import { SummaryEditor } from "../components/SummaryEditor";
import { clientParticipants } from "../copy";

export function ReviewScreen({ callId }: { callId: string }) {
  const { data, isPending, isError, refetch } = useCall(callId);
  const approve = useApproveSummary();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ApproveSummaryResult | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load this summary"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const { call, summary } = data;
  if (!summary) {
    return (
      <EmptyState
        title="No summary to review"
        description="A summary is drafted when a call ends. Open the call to see what is available."
        action={
          <Link href={`/calls/${call.id}`} className={cn(buttonVariants({ variant: "secondary" }))}>
            Open call
          </Link>
        }
      />
    );
  }

  const approved = summary.status === "approved";
  const contactName = clientParticipants(call)[0]?.name ?? "the client";

  const doApprove = () =>
    approve.mutate(callId, {
      onSuccess: (value) => {
        setResult(value);
        setConfirming(false);
        toast(`Summary approved. ${plural(value.createdTasks.length, "task")} added.`);
      },
      onError: (error) => {
        setConfirming(false);
        toast.error(`Couldn't approve the summary. ${(error as ApiError).message}`);
      },
    });

  return (
    <div className="space-y-6" data-tour="review">
      <CallHeader call={call} />
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-coal">
          {approved ? "Summary" : "Draft summary"}
        </h2>
        {approved ? <StatusPill tone="done">Approved</StatusPill> : null}
      </div>

      {approved && result ? (
        <section aria-label="What approving did" className="space-y-3 border-y border-cinder py-4">
          <p className="text-sm font-medium text-coal">
            {plural(result.createdTasks.length, "task")} added, and the opportunity is updated.
          </p>
          <ul className="space-y-1 text-sm text-coal">
            {result.createdTasks.map((task) => (
              <li key={task.id}>
                {task.title}, due {dateTime(task.dueAt)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setDraftOpen(true)}>
              View follow-up draft
            </Button>
            <Link href="/tasks" className={cn(buttonVariants({ variant: "secondary" }))}>
              Open tasks
            </Link>
            <Link
              href={`/deals/${call.dealId}`}
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              Open opportunity
            </Link>
          </div>
        </section>
      ) : null}

      <SummaryEditor callId={callId} summary={summary} />

      {approved ? null : (
        <div className="flex items-center gap-3 border-t border-cinder pt-4">
          <Button variant="primary" onClick={() => setConfirming(true)}>
            Approve summary
          </Button>
          <p className="text-detail text-smoke">Nothing is shared until you approve.</p>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle className="text-xl">Approve this summary?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-smoke">
            This adds{" "}
            {plural(
              summary.commitments.length +
                (summary.nextAction &&
                !summary.commitments.some((c) => c.text === summary.nextAction)
                  ? 1
                  : 0),
              "task",
            )}
            , updates {call.company} and prepares a follow-up to {contactName}.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button>Keep editing</Button>
            </DialogClose>
            <Button variant="primary" onClick={doApprove} disabled={approve.isPending}>
              Approve
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DraftSheet
        dealId={draftOpen ? call.dealId : null}
        company={call.company}
        contactName={contactName}
        onClose={() => setDraftOpen(false)}
      />
    </div>
  );
}
