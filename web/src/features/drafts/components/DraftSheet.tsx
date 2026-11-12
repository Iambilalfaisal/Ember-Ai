"use client";

import {
  useDrafts,
  useRegenerateDraft,
  useSendDraft,
  useUpdateDraft,
  type ApiError,
} from "@ember/api";
import {
  DialogClose,
  DialogDescription,
  DialogTitle,
  Dialog,
  DraftComposer,
  EmptyState,
  ErrorState,
  SheetContent,
  Skeleton,
  Button,
} from "@ember/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type SheetProps = {
  /** The opportunity whose draft to show. Null keeps the sheet closed. */
  dealId: string | null;
  company: string;
  contactName: string;
  onClose: () => void;
};

/** The suggested reply for one opportunity, in a panel beside the list it came from. */
export function DraftSheet({ dealId, company, contactName, onClose }: SheetProps) {
  return (
    <Dialog open={dealId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-semibold">Reply to {contactName}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-smoke">{company}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </DialogClose>
        </div>
        {dealId ? <DraftBody dealId={dealId} contactName={contactName} /> : null}
      </SheetContent>
    </Dialog>
  );
}

function DraftBody({ dealId, contactName }: { dealId: string; contactName: string }) {
  const { data: drafts, isPending, isError, refetch } = useDrafts(dealId);
  const draft = drafts?.[0];

  if (isPending) {
    return (
      <div className="mt-6 space-y-3" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the draft"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }
  if (!draft) {
    return (
      <EmptyState
        title="No draft yet"
        description="A suggested reply appears here once there is something to follow up on."
      />
    );
  }
  // Key by version so a regenerated draft replaces the text being edited.
  return <Editor key={`${draft.id}-${draft.version}`} draft={draft} contactName={contactName} />;
}

function Editor({
  draft,
  contactName,
}: {
  draft: NonNullable<ReturnType<typeof useDrafts>["data"]>[number];
  contactName: string;
}) {
  const [body, setBody] = useState(draft.body);
  const update = useUpdateDraft();
  const regenerate = useRegenerateDraft();
  const send = useSendDraft();
  const sent = draft.status === "sent";

  const failed = (error: Error, what: string) => {
    const message = (error as ApiError).message || "Try again in a moment.";
    toast.error(`${what}. ${message}`);
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <p className="text-detail text-smoke">Subject</p>
        <p className="text-sm font-medium text-coal">{draft.subject}</p>
      </div>
      <DraftComposer
        label="Suggested reply"
        body={body}
        onBodyChange={setBody}
        facts={draft.factsUsed}
        status={sent ? "sent" : "draft"}
        onRegenerate={() =>
          regenerate.mutate(draft.id, { onError: (error) => failed(error, "Couldn't regenerate") })
        }
        onCopy={() => {
          void navigator.clipboard?.writeText(`${draft.subject}\n\n${body}`);
        }}
        onSend={() => {
          const sendNow = () =>
            send.mutate(draft.id, {
              onSuccess: () => toast(`Sent to ${contactName}.`),
              onError: (error) => failed(error, "Couldn't send"),
            });
          // Save the edits first so what goes out is what is on screen.
          if (body !== draft.body) {
            update.mutate(
              { id: draft.id, body: { body } },
              { onSuccess: sendNow, onError: (error) => failed(error, "Couldn't save your edits") },
            );
          } else {
            sendNow();
          }
        }}
      />
      <p className="text-detail text-smoke">
        {sent
          ? "Logged on the opportunity as an email."
          : "Sends from your Outlook account. In this demo, nothing leaves Ember."}
      </p>
    </div>
  );
}
