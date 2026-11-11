import { z } from "zod";
import { Stage } from "./common";

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
  integrations: z.array(Integration),
  aiUsage: z.object({ month: z.string(), answers: z.number().int(), costUsd: z.number() }),
});
export type Settings = z.infer<typeof Settings>;
