"use client";

import { useNotes, useUpdateNotes } from "@ember/api";
import { ErrorState, ExtractedField, Skeleton } from "@ember/ui";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { HighlightedText } from "./HighlightedText";

/** What the rep wrote on the discovery call, and what Ember pulled out of it. Collapsed until asked for. */
export function DiscoveryNotes({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section>
      <h3 className="text-sm font-medium text-coal">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 w-full items-center justify-between rounded-control text-left transition-instant hover:text-smoke"
        >
          Discovery notes
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div id={panelId} hidden={!open}>
        {open ? <NotesBody dealId={dealId} /> : null}
      </div>
    </section>
  );
}

function NotesBody({ dealId }: { dealId: string }) {
  const { data, isPending, isError, refetch } = useNotes(dealId);
  const update = useUpdateNotes();

  if (isPending) {
    return (
      <div className="space-y-2 pb-2" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the notes"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
        className="px-4 py-2"
      />
    );
  }

  const save = (field: "openQuestion" | "nextAction" | "blocker") => (value: string) =>
    update.mutate(
      { dealId, body: { [field]: value } },
      { onError: () => toast.error("Couldn't save that change. Try again.") },
    );

  return (
    <div className="space-y-4 pb-2">
      <div>
        <p className="text-detail text-smoke">Original notes</p>
        <p className="mt-1 max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-coal">
          <HighlightedText text={data.text} phrases={data.highlights} />
        </p>
      </div>
      <div className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
        <ExtractedField
          label="Open question"
          value={data.extracted.openQuestion}
          onSave={save("openQuestion")}
          className="px-4 py-2"
        />
        <ExtractedField
          label="Next action"
          value={data.extracted.nextAction}
          onSave={save("nextAction")}
          className="px-4 py-2"
        />
        <ExtractedField
          label="Blocker"
          value={data.extracted.blocker}
          onSave={save("blocker")}
          className="px-4 py-2"
        />
      </div>
    </div>
  );
}
