import { z } from "zod";
import { SourceRef } from "./calls";

// Live call events. The first group mirrors the backend realtime protocol; the second group does not
// exist there yet and is flagged for the backend (docs/frontend-plan.md section 4).

const base = { at: z.number().describe("Milliseconds since the call started") };

export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("session.ready") }),
  z.object({
    ...base,
    type: z.literal("transcript.partial"),
    speaker: z.enum(["client", "rep"]),
    name: z.string(),
    segmentId: z.string(),
    text: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("transcript.final"),
    speaker: z.enum(["client", "rep"]),
    name: z.string(),
    segmentId: z.string(),
    text: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("card.start"),
    cardId: z.string(),
    source: SourceRef.nullable(),
  }),
  z.object({ ...base, type: z.literal("card.delta"), cardId: z.string(), text: z.string() }),
  z.object({ ...base, type: z.literal("card.end"), cardId: z.string() }),
  z.object({
    ...base,
    type: z.literal("card.not_confirmed"),
    cardId: z.string(),
    holdingLine: z.string(),
  }),
  // Not in the backend protocol yet:
  z.object({ ...base, type: z.literal("suggestion.next_question"), question: z.string() }),
  z.object({
    ...base,
    type: z.literal("card.objection"),
    cardId: z.string(),
    objection: z.string(),
    response: z.string(),
    source: SourceRef.nullable(),
  }),
  z.object({
    ...base,
    type: z.literal("alert.contradiction"),
    earlier: z.string(),
    now: z.string(),
  }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;
export type LiveEventType = LiveEvent["type"];
