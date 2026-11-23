import type { Deal } from "@ember/api";
import { plural } from "./format";

const DAY = 86_400_000;
const days = (from: string | null, now: number) =>
  from === null ? null : Math.max(0, Math.floor((now - new Date(from).getTime()) / DAY));

/** The facts the copilot reads off a deal, worked out in one place so every screen says the same thing. */
export type DealSignals = {
  daysInStage: number;
  /** Days since a call, meeting or real email. Notes and edits do not count. Null when there was never one. */
  daysSinceContact: number | null;
  /** Days past the next action's due date. Zero when it is due today or not yet due. */
  overdueDays: number;
  dueToday: boolean;
  noNextAction: boolean;
};

export function dealSignals(deal: Deal, now: number): DealSignals {
  const due = deal.nextActionDueAt ? new Date(deal.nextActionDueAt).getTime() : null;
  const overdue = due === null ? 0 : Math.max(0, Math.floor((now - due) / DAY));
  return {
    daysInStage: days(deal.stageChangedAt ?? deal.createdAt, now) ?? 0,
    daysSinceContact: days(deal.lastMeaningfulAt, now),
    overdueDays: overdue,
    dueToday:
      due !== null &&
      overdue === 0 &&
      due <= now + DAY &&
      new Date(due).toDateString() === new Date(now).toDateString(),
    noNextAction: deal.nextAction === null && deal.stage !== "won" && deal.stage !== "lost",
  };
}

/** "Last real contact 6 days ago", or a plain line when there has been none. */
export function contactLabel(daysSince: number | null): string {
  if (daysSince === null) return "No call or email yet";
  if (daysSince === 0) return "Spoke today";
  return `Last call or email ${plural(daysSince, "day")} ago`;
}
