"use client";

import { callChannels, useLogCall } from "@ember/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Textarea } from "@ember/ui";
import { useState } from "react";
import { toast } from "sonner";
import { plural } from "@/lib/format";

const CHANNEL_LABEL: Record<(typeof callChannels)[number], string> = {
  phone: "Phone call",
  whatsapp: "WhatsApp call",
  video: "Video call",
  in_person: "In person",
};

/** Log a call that happened outside Teams. Each promise on its own line becomes a task. */
export function LogCallDialog({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const log = useLogCall();
  const [channel, setChannel] = useState<(typeof callChannels)[number]>("phone");
  const [summary, setSummary] = useState("");
  const [commitments, setCommitments] = useState("");
  const [nextAction, setNextAction] = useState("");
  const lines = commitments
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const ready = summary.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(36rem,calc(100vw-32px))]">
        <DialogTitle className="text-lg font-semibold text-coal">
          Log a call with {company}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-smoke">
          For calls held on the phone, on WhatsApp or in person. Ember adds it to the timeline and
          counts it as real contact.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            log.mutate(
              {
                dealId,
                body: {
                  channel,
                  summary: summary.trim(),
                  commitments: lines,
                  nextAction: nextAction.trim() || null,
                },
              },
              {
                onSuccess: (result) => {
                  toast.success(
                    result.tasksCreated > 0
                      ? `Call logged. ${plural(result.tasksCreated, "task")} created.`
                      : "Call logged.",
                  );
                  onClose();
                },
                onError: () => toast.error("Couldn't log that call. Try again."),
              },
            );
          }}
        >
          <label className="block space-y-1 text-detail text-smoke">
            How it happened
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
              className="h-9 w-full rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris"
            >
              {callChannels.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-detail text-smoke">
            What was said
            <Textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="text-coal"
            />
          </label>
          <label className="block space-y-1 text-detail text-smoke">
            Promises made (one per line)
            <Textarea
              rows={3}
              value={commitments}
              onChange={(e) => setCommitments(e.target.value)}
              className="text-coal"
            />
          </label>
          <label className="block space-y-1 text-detail text-smoke">
            Next action
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="h-9 w-full rounded-control border border-smoke bg-paper px-3 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!ready || log.isPending}>
              Log call
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
