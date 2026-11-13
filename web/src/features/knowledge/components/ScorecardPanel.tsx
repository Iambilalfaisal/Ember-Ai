"use client";

import { useScorecard } from "@ember/api";
import { ErrorState, MetricTile, Skeleton } from "@ember/ui";
import { dateTime, plural } from "@/lib/format";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function ScorecardPanel() {
  const { data, isPending, isError, refetch } = useScorecard();

  return (
    <section aria-labelledby="scorecard-heading" className="space-y-3">
      <div>
        <h2 id="scorecard-heading" className="text-lg font-medium text-coal">
          Quality scorecard
        </h2>
        {data ? (
          <p className="text-detail text-smoke">
            Latest evaluation, {dateTime(data.runAt)}, {plural(data.questions, "question")}
          </p>
        ) : null}
      </div>
      {isPending ? (
        <div className="grid grid-cols-5 gap-6" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load the scorecard"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
          <MetricTile label="Correct" value={percent(data.correct)} />
          <MetricTile label="Grounded in a source" value={percent(data.grounded)} />
          <MetricTile
            label="Not confirmed accuracy"
            value={percent(data.notConfirmedAccuracy)}
            note="Unanswerable questions caught"
          />
          <MetricTile label="Response time, typical" value={seconds(data.latencyP50Ms)} />
          <MetricTile label="Response time, slowest" value={seconds(data.latencyP95Ms)} />
        </div>
      )}
    </section>
  );
}
