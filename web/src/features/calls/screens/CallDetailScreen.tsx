"use client";

import { useCall } from "@ember/api";
import {
  EmptyState,
  ErrorState,
  SourceChip,
  Skeleton,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
  cn,
} from "@ember/ui";
import Link from "next/link";
import { formatDuration } from "@ember/ui";
import { CallHeader } from "../components/CallHeader";
import { CARD_KIND_LABEL, callState } from "../copy";
import { dateTime } from "@/lib/format";

export function CallDetailScreen({ callId }: { callId: string }) {
  const { data, isPending, isError, refetch } = useCall(callId);

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load this call"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const { call, summary, cards, transcript } = data;
  const state = callState(call);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <CallHeader call={call} />
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="answers">Answers</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          {summary ? (
            <div className="grid gap-x-10 gap-y-4 rounded-panel border border-cinder bg-paper p-5 shadow-card lg:grid-cols-2">
              <div className="flex items-center gap-3 lg:col-span-2">
                <h3 className="text-sm font-medium text-coal">
                  {summary.status === "draft" ? "Draft summary" : "Summary"}
                </h3>
                {summary.status === "draft" ? (
                  <Link
                    href={`/calls/${call.id}/review`}
                    className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
                  >
                    Review summary
                  </Link>
                ) : (
                  <StatusPill tone="done">Approved</StatusPill>
                )}
              </div>
              <ul className="max-w-[72ch] list-disc space-y-1 pl-5 text-sm text-coal lg:col-span-2">
                {summary.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {summary.clientQuestions.length > 0 ? (
                <div>
                  <p className="text-detail text-smoke">Questions from the client</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-coal">
                    {summary.clientQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {summary.commitments.length > 0 ? (
                <div>
                  <p className="text-detail text-smoke">Commitments</p>
                  <ul className="mt-1 space-y-1 text-sm text-coal">
                    {summary.commitments.map((c) => (
                      <li key={c.text}>
                        {c.text}, due {dateTime(c.dueAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {summary.nextAction ? (
                <div>
                  <p className="text-detail text-smoke">Next action</p>
                  <p className="text-sm text-coal">{summary.nextAction}</p>
                </div>
              ) : null}
              {summary.blocker ? (
                <div>
                  <p className="text-detail text-smoke">Blocker</p>
                  <p className="text-sm text-coal">{summary.blocker}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No summary yet"
              description={
                call.status === "upcoming"
                  ? "A summary is drafted when the call ends. Open the brief to prepare."
                  : "This call has no summary."
              }
              action={
                call.status === "upcoming" ? (
                  <Link
                    href={`/calls/${call.id}/prep`}
                    className={cn(buttonVariants({ variant: "secondary" }))}
                  >
                    Open brief
                  </Link>
                ) : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="answers">
          {cards.length === 0 ? (
            <EmptyState
              title="No answers on this call"
              description="Answers, objections and suggested questions appear here after a call with the assistant on."
            />
          ) : (
            <ul className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
              {cards.map((card) => (
                <li key={card.id} className="space-y-1 px-4 py-3">
                  <p className="text-detail text-smoke">
                    {CARD_KIND_LABEL[card.kind]} at {formatDuration(card.atSec)}
                    {card.verdict ? `, marked ${card.verdict}` : ""}
                  </p>
                  <p className="max-w-[72ch] text-sm text-coal">{card.text}</p>
                  {card.source ? <SourceChip source={card.source} /> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="transcript">
          {transcript.length === 0 ? (
            <EmptyState
              title="No transcript"
              description="Transcripts are kept for calls made with the assistant on."
            />
          ) : (
            <ol aria-label="Transcript" className="space-y-3">
              {transcript.map((line) => (
                <li key={line.id}>
                  <p className="text-xs font-medium text-smoke">
                    {line.name}, {formatDuration(line.atSec)}
                  </p>
                  <p
                    className={cn(
                      "max-w-[72ch] text-sm",
                      line.speaker === "client" ? "text-coal" : "text-smoke",
                    )}
                  >
                    {line.text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
