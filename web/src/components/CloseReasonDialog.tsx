"use client";

import { useLists, WON_REASONS, type Stage } from "@ember/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@ember/ui";
import { useState } from "react";

const selectClass =
  "h-9 w-full rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris";

/** Asks why an opportunity is being closed. The reason is required, so nothing closes without one. */
export function CloseReasonDialog({
  company,
  stage,
  onConfirm,
  onCancel,
  busy = false,
}: {
  company: string;
  stage: Extract<Stage, "won" | "lost">;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { data: lists, isPending } = useLists();
  const options = stage === "won" ? [...WON_REASONS] : (lists?.lostReasons ?? []);
  const [reason, setReason] = useState("");
  const word = stage === "won" ? "won" : "lost";

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold text-coal">
          Why was {company} {word}?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-smoke">
          Ember uses this to see what is working. It takes a second.
        </DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) onConfirm(reason);
          }}
        >
          <label className="block space-y-1 text-detail text-smoke">
            Reason
            <select
              value={reason}
              disabled={stage === "lost" && isPending}
              onChange={(event) => setReason(event.target.value)}
              className={selectClass}
            >
              <option value="">Choose a reason</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Keep it open
            </Button>
            <Button type="submit" variant="primary" disabled={!reason || busy}>
              Close as {word}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
