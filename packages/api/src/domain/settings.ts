import { z } from "zod";
import { DEFAULT_LOST_REASONS, DEFAULT_SOURCES, Stage } from "./common";

export const Integration = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["connected", "not_connected"]),
});

export const Settings = z.object({
  /** Days without a meaningful interaction before a deal needs attention, per stage. */
  followUpDays: z.record(Stage, z.number().int()),
  recordingConsent: z.enum(["required", "announce", "off"]),
  retentionDays: z.number().int(),
  /** Editable lists for the source and lost-reason pickers. */
  sources: z.array(z.string()).default([...DEFAULT_SOURCES]),
  lostReasons: z.array(z.string()).default([...DEFAULT_LOST_REASONS]),
  /** Company defaults: they decide when a due date falls and when the morning digest goes out. */
  timeZone: z.string().default("Asia/Karachi"),
  workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  defaultCurrency: z.string().default("USD"),
  integrations: z.array(Integration),
  aiUsage: z.object({ month: z.string(), answers: z.number().int(), costUsd: z.number() }),
});
export type Settings = z.infer<typeof Settings>;

/** The two pick-lists, readable by every role so reps can use them. */
export const PickLists = z.object({
  sources: z.array(z.string()),
  lostReasons: z.array(z.string()),
});
export type PickLists = z.infer<typeof PickLists>;
