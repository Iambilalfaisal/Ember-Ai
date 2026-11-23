"use client";

import { usePreferences, useUpdatePreferences, type NotificationPrefs } from "@ember/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  ErrorState,
  Skeleton,
  Switch,
} from "@ember/ui";
import { toast } from "sonner";

const ROWS: { key: keyof Omit<NotificationPrefs, "digestHour">; label: string; hint: string }[] = [
  { key: "digestInApp", label: "Morning digest in Ember", hint: "Shown at the top of Copilot." },
  { key: "digestEmail", label: "Morning digest by email", hint: "Sent at the hour below." },
  { key: "remindersInApp", label: "Reminders in Ember", hint: "Overdue next actions and tasks." },
  { key: "remindersEmail", label: "Reminders by email", hint: "One email when something is due." },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? "AM" : "PM"}`;

/** Each person chooses how the copilot reaches them. Saved as soon as a choice changes. */
export function PrefsDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, isError, refetch } = usePreferences();
  const update = useUpdatePreferences();
  const save = (body: Partial<NotificationPrefs>) =>
    update.mutate(body, {
      onSuccess: () => toast("Saved."),
      onError: () => toast.error("Couldn't save that. Try again."),
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold text-coal">Digest and reminders</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-smoke">
          Choose how Ember reaches you. These are your own settings.
        </DialogDescription>
        {isPending ? (
          <div className="mt-4 space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-4">
            <ErrorState
              title="Couldn't load your settings"
              description="Check your connection and try again."
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <ul className="divide-y divide-cinder rounded-panel border border-cinder">
              {ROWS.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>
                    <span id={`pref-${row.key}`} className="block text-sm text-coal">
                      {row.label}
                    </span>
                    <span className="block text-detail text-smoke">{row.hint}</span>
                  </span>
                  <Switch
                    aria-labelledby={`pref-${row.key}`}
                    checked={data[row.key]}
                    disabled={update.isPending}
                    onCheckedChange={(checked) => save({ [row.key]: checked })}
                  />
                </li>
              ))}
            </ul>
            <label className="flex items-center justify-between gap-4 text-sm text-coal">
              Send the digest at
              <select
                value={data.digestHour}
                onChange={(event) => save({ digestHour: Number(event.target.value) })}
                className="h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
