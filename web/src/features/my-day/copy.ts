import { plural } from "@/lib/format";

export const overdueLabel = (days: number) =>
  days === 0 ? "Due today" : `${plural(days, "day")} overdue`;

export const countsLabel = (needYou: number) =>
  `${needYou} ${needYou === 1 ? "needs" : "need"} you today`;
