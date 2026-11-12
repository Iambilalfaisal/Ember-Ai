"use client";

import { useCall, useEndCall, useScenario, type Call, type LiveEvent } from "@ember/api";
import { Button, EmptyState, ErrorState, Segmented, Skeleton, buttonVariants, cn } from "@ember/ui";
import { LivePanel, MockLiveSession, useLiveSession, type PlaybackSpeed } from "@ember/live";
import { Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CallStage } from "../components/CallStage";

export function LiveCallScreen({ callId }: { callId: string }) {
  const call = useCall(callId);
  const scenario = useScenario(callId);

  if (call.isPending || (scenario.isPending && !scenario.isError)) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (call.isError) {
    return (
      <ErrorState
        title="Couldn't load this call"
        description="Check your connection and try again."
        onRetry={() => void call.refetch()}
      />
    );
  }
  const info = call.data.call;
  if (info.status === "completed") {
    return (
      <EmptyState
        title="This call has ended"
        description="Its summary and answers are in the call library."
        action={
          <Link href={`/calls/${info.id}`} className={cn(buttonVariants({ variant: "secondary" }))}>
            Open call
          </Link>
        }
      />
    );
  }
  if (scenario.isError) {
    return (
      <EmptyState
        title="No scripted call for this one"
        description="The demo plays a script for the Blue Harbor call. Open that call from My Day to see the assistant at work."
        action={
          <Link href="/calls" className={cn(buttonVariants({ variant: "secondary" }))}>
            Open calls
          </Link>
        }
      />
    );
  }
  return <Stage call={info} events={scenario.data} />;
}

function Stage({ call, events }: { call: Call; events: LiveEvent[] }) {
  const router = useRouter();
  // The script is read once. Refreshing data during the call must not restart it.
  const [session] = useState(() => new MockLiveSession(events));
  const { state, playback, feedback, markAsked } = useLiveSession(session);
  const end = useEndCall();

  useEffect(() => {
    void session.start(call.id);
    return () => {
      void session.end();
    };
  }, [session, call.id]);

  const endCall = async () => {
    await session.end();
    const { elapsedMs } = session.snapshot();
    try {
      // Not mutate with callbacks: ending the call refreshes the call, which unmounts this stage before
      // the callbacks would run.
      await end.mutateAsync({
        id: call.id,
        body: {
          durationMin: Math.max(1, Math.round(elapsedMs / 60_000)),
          transcript: state.transcript
            .filter((line) => !line.partial)
            .map((line) => ({
              id: line.id,
              speaker: line.speaker,
              name: line.name,
              text: line.text,
              atSec: Math.round(line.atMs / 1000),
            })),
          cards: state.cards.map((card) => ({
            id: card.id,
            kind: card.kind,
            text: card.text,
            source: card.source,
            atSec: Math.round(card.atMs / 1000),
            verdict: card.verdict,
          })),
        },
      });
      router.push(`/calls/${call.id}/review`);
    } catch {
      toast.error("Couldn't end the call. Try again.");
      void session.start(call.id);
    }
  };

  return (
    <div className="flex min-h-[32rem] flex-col gap-4 lg:h-[calc(100dvh-8.5rem)]">
      <div
        role="group"
        aria-label="Demo controls"
        className="flex flex-wrap items-center gap-3 border-b border-cinder pb-3"
      >
        <p className="text-detail text-smoke">A scripted call. Nothing is recorded.</p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => (playback.playing ? session.pause() : session.play())}
            disabled={playback.finished}
          >
            {playback.playing ? (
              <Pause aria-hidden="true" className="size-3.5" />
            ) : (
              <Play aria-hidden="true" className="size-3.5" />
            )}
            {playback.playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" onClick={() => session.restart()}>
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Restart
          </Button>
          <Segmented
            label="Speed"
            value={String(playback.speed) as "1" | "2"}
            onValueChange={(value) => session.setSpeed(Number(value) as PlaybackSpeed)}
            options={[
              { value: "1", label: "1×" },
              { value: "2", label: "2×" },
            ]}
          />
        </div>
      </div>
      {playback.finished ? (
        <p role="status" className="text-sm text-coal">
          The script has finished. End the call to review the summary.
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <CallStage
          participants={call.participants}
          onEnd={() => void endCall()}
          ending={end.isPending}
        />
        <LivePanel
          state={state}
          elapsedSec={playback.elapsedMs / 1000}
          paused={!playback.playing && !playback.finished}
          onFeedback={feedback}
          onAsked={markAsked}
          className="rounded-panel border"
        />
      </div>
    </div>
  );
}
