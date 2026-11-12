export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "stalled", label: "Stalled" },
  { value: "unassigned", label: "Unassigned" },
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  needs_attention: "Needs attention",
  stalled: "Stalled",
  unassigned: "Unassigned",
};

export const STATUS_TONE: Record<string, "neutral" | "done" | "attention" | "overdue"> = {
  on_track: "done",
  needs_attention: "attention",
  stalled: "attention",
  unassigned: "neutral",
};
