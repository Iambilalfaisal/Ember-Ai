"use client";

import { usePilotReport } from "@ember/api";
import { EmptyState, ErrorState, MetricTile, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { plural, shortDate } from "@/lib/format";
import { ReportTable } from "../components/ReportTable";
import { WeeklyChart, type ChartSeries } from "../components/WeeklyChart";

const count = (value: number) => String(Math.round(value));
const percent = (value: number) => `${Math.round(value)}%`;
const minutes = (value: number) => {
  const rounded = Math.round(value);
  return rounded >= 120 ? `${(rounded / 60).toFixed(1)} h` : `${rounded} min`;
};

const trend = (name: string, values: number[], format: (v: number) => string) =>
  `${name}: ${format(values[0] ?? 0)} in the first week to ${format(values.at(-1) ?? 0)} in the latest.`;

export function ReportsScreen() {
  const { data, isPending, isError, refetch } = usePilotReport();
  const [view, setView] = useState<"charts" | "table">("charts");

  if (isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-5 gap-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load the pilot report"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }
  const weeks = data.weeks;
  const first = weeks[0];
  const latest = weeks.at(-1);
  if (!first || !latest) {
    return (
      <EmptyState
        title="No pilot data yet"
        description="Metrics appear here after the first full week of calls."
      />
    );
  }

  const labels = weeks.map((w) => shortDate(w.weekStart));
  const accuracy = weeks.map((w) => (w.answersUsed ? (w.answersCorrect / w.answersUsed) * 100 : 0));
  const used = weeks.map((w) => w.answersUsed);
  const tech = weeks.map((w) => w.techQuestionsHandled);
  const followUp = weeks.map((w) => w.followUpMinutes);
  const proposals = weeks.map((w) => w.dealsToProposal);
  const overdue: ChartSeries[] = (latest.overdueByRep ?? []).map((rep, index) => ({
    name: rep.repName,
    tone: index === 0 ? "coal" : "smoke",
    values: weeks.map((w) => w.overdueByRep.find((o) => o.repId === rep.repId)?.overdue ?? 0),
  }));
  const overdueTotal = latest.overdueByRep.reduce((sum, rep) => sum + rep.overdue, 0);
  const overdueFirst = first.overdueByRep.reduce((sum, rep) => sum + rep.overdue, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-coal">Pilot metrics</h2>
          <p className="text-detail text-smoke">
            {plural(weeks.length, "week")}, from {labels[0]} to the week of {labels.at(-1)}
          </p>
        </div>
        <Segmented
          label="Show report as"
          value={view}
          onValueChange={setView}
          options={[
            { value: "charts", label: "Charts" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      <section
        data-tour="report-metrics"
        aria-label="Latest week"
        className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5"
      >
        <MetricTile
          label="Answers used"
          value={count(latest.answersUsed)}
          note={`${count(first.answersUsed)} in week one`}
        />
        <MetricTile
          label="Answers correct"
          value={percent(accuracy.at(-1) ?? 0)}
          note={`${percent(accuracy[0] ?? 0)} in week one`}
        />
        <MetricTile
          label="Technical questions handled"
          value={count(latest.techQuestionsHandled)}
          note="Without a callback"
        />
        <MetricTile
          label="Call end to follow-up"
          value={minutes(latest.followUpMinutes)}
          note={`${minutes(first.followUpMinutes)} in week one`}
        />
        <MetricTile
          label="Overdue follow-ups"
          value={count(overdueTotal)}
          note={`${count(overdueFirst)} in week one`}
        />
      </section>

      {view === "table" ? (
        <ReportTable weeks={weeks} />
      ) : (
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <WeeklyChart
            title="Answers used"
            unit="Answers a rep used on a call, per week"
            weeks={labels}
            series={[{ name: "Answers used", values: used, tone: "coal" }]}
            format={count}
            summary={trend("Answers used per week", used, count)}
          />
          <WeeklyChart
            title="Answers correct"
            unit="Share of used answers a rep marked correct"
            weeks={labels}
            series={[{ name: "Answers correct", values: accuracy, tone: "coal" }]}
            format={percent}
            summary={trend("Answers correct", accuracy, percent)}
          />
          <WeeklyChart
            title="Technical questions handled"
            unit="Answered on the call, without a callback"
            weeks={labels}
            series={[{ name: "Handled", values: tech, tone: "coal" }]}
            format={count}
            summary={trend("Technical questions handled", tech, count)}
          />
          <WeeklyChart
            title="Time from call end to follow-up"
            unit="Median minutes until the follow-up is sent"
            weeks={labels}
            series={[{ name: "Median minutes", values: followUp, tone: "coal" }]}
            format={count}
            summary={trend("Time to follow-up in minutes", followUp, count)}
          />
          <WeeklyChart
            title="Overdue follow-ups by rep"
            unit="Open at the end of the week"
            weeks={labels}
            series={overdue}
            format={count}
            summary={`Overdue follow-ups across reps: ${overdueFirst} in the first week to ${overdueTotal} in the latest.`}
          />
          <WeeklyChart
            title="Deals moving to proposal"
            unit="Deals that reached the proposal stage, per week"
            weeks={labels}
            series={[{ name: "Deals", values: proposals, tone: "coal" }]}
            kind="bar"
            format={count}
            summary={trend("Deals moving to proposal", proposals, count)}
          />
        </div>
      )}
    </div>
  );
}
