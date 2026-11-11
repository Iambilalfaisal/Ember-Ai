import { z } from "zod";
import { isoDate } from "./common";

export const WeeklyMetrics = z.object({
  weekStart: isoDate,
  answersUsed: z.number().int(),
  answersCorrect: z.number().int(),
  techQuestionsHandled: z.number().int(),
  /** Median minutes from call end to follow-up sent. */
  followUpMinutes: z.number(),
  dealsToProposal: z.number().int(),
  overdueByRep: z.array(
    z.object({ repId: z.string(), repName: z.string(), overdue: z.number().int() }),
  ),
});
export type WeeklyMetrics = z.infer<typeof WeeklyMetrics>;

export const PilotReport = z.object({ weeks: z.array(WeeklyMetrics) });
export type PilotReport = z.infer<typeof PilotReport>;
