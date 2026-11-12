import type { Call } from "@ember/api";

export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export const AWAITING_SUMMARY = "Summary waiting for approval";

/** What a call is, in a word, and how the pill should look. */
export function callState(call: Call): {
  label: string;
  tone: "neutral" | "done" | "attention";
} {
  if (call.status === "upcoming") return { label: "Upcoming", tone: "neutral" };
  if (call.outcome === AWAITING_SUMMARY) return { label: "Summary to approve", tone: "attention" };
  return { label: "Completed", tone: "done" };
}

export const CARD_KIND_LABEL = {
  answer: "Answer",
  not_confirmed: "Not confirmed",
  objection: "Objection",
  contradiction: "Changed from earlier",
  next_question: "Suggested question",
} as const;

export const clientParticipants = (call: Call) =>
  call.participants.filter((p) => p.side === "client");
