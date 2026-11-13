"use client";

import { useUpdateSummary, type CallSummary } from "@ember/api";
import { ExtractedField } from "@ember/ui";
import { toast } from "sonner";
import { dateTime } from "@/lib/format";

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-14 px-4 py-2">
      <p className="text-detail text-smoke">{label}</p>
      <p className="max-w-[72ch] text-sm text-coal">{value || "None"}</p>
    </div>
  );
}

/** The draft summary. Every line can be fixed in place until it is approved. */
export function SummaryEditor({ callId, summary }: { callId: string; summary: CallSummary }) {
  const update = useUpdateSummary();
  const locked = summary.status === "approved";
  const save = (body: Parameters<typeof update.mutate>[0]["body"]) =>
    update.mutate(
      { id: callId, body },
      { onError: () => toast.error("Couldn't save that change. Try again.") },
    );
  const replaceAt = (list: string[], index: number, value: string) =>
    list.map((item, i) => (i === index ? value : item));

  const field = (label: string, value: string, onSave: (value: string) => void) =>
    locked ? (
      <Read key={label} label={label} value={value} />
    ) : (
      <ExtractedField
        key={label}
        label={label}
        value={value}
        onSave={onSave}
        className="px-4 py-2"
      />
    );

  return (
    <div className="space-y-6">
      <section aria-labelledby="key-points">
        <h3 id="key-points" className="text-sm font-medium text-coal">
          Key points
        </h3>
        <div className="mt-1 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
          {summary.keyPoints.map((point, i) =>
            field(`Key point ${i + 1}`, point, (value) =>
              save({ keyPoints: replaceAt(summary.keyPoints, i, value) }),
            ),
          )}
        </div>
      </section>

      {summary.clientQuestions.length > 0 ? (
        <section aria-labelledby="client-questions">
          <h3 id="client-questions" className="text-sm font-medium text-coal">
            Questions from the client
          </h3>
          <div className="mt-1 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
            {summary.clientQuestions.map((q, i) =>
              field(`Question ${i + 1}`, q, (value) =>
                save({ clientQuestions: replaceAt(summary.clientQuestions, i, value) }),
              ),
            )}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="commitments">
        <h3 id="commitments" className="text-sm font-medium text-coal">
          Commitments
        </h3>
        {summary.commitments.length === 0 ? (
          <p className="mt-1 text-sm text-smoke">No commitments were made on this call.</p>
        ) : (
          <div className="mt-1 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
            {summary.commitments.map((c, i) => (
              <div key={`${i}-${c.dueAt}`}>
                {field(`Commitment ${i + 1}`, c.text, (value) =>
                  save({
                    commitments: summary.commitments.map((item, j) =>
                      j === i ? { ...item, text: value } : item,
                    ),
                  }),
                )}
                <p className="-mt-1 px-4 pb-2 text-detail text-smoke">Due {dateTime(c.dueAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="after-call" className="space-y-0">
        <h3 id="after-call" className="text-sm font-medium text-coal">
          After the call
        </h3>
        <div className="mt-1 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
          {field("Next action", summary.nextAction, (value) => save({ nextAction: value }))}
          {field("Blocker", summary.blocker, (value) => save({ blocker: value }))}
        </div>
      </section>
    </div>
  );
}
