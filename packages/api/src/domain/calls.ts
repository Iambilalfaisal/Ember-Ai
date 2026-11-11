import { z } from "zod";
import { isoDate } from "./common";

export const Participant = z.object({
  name: z.string(),
  role: z.string(),
  side: z.enum(["client", "rep"]),
});
export type Participant = z.infer<typeof Participant>;

export const Call = z.object({
  id: z.string(),
  dealId: z.string(),
  company: z.string(),
  title: z.string(),
  startsAt: isoDate,
  durationMin: z.number().int(),
  status: z.enum(["upcoming", "completed"]),
  repId: z.string(),
  participants: z.array(Participant),
  outcome: z.string().nullable(),
  /** The scripted live scenario to play for this call, if there is one. */
  scenarioId: z.string().nullable(),
});
export type Call = z.infer<typeof Call>;

export const CallBrief = z.object({
  callId: z.string(),
  accountSummary: z.string(),
  openQuestions: z.array(z.string()),
  commitments: z.array(z.string()),
  likelyObjections: z.array(z.string()),
  agenda: z.array(z.string()),
});
export type CallBrief = z.infer<typeof CallBrief>;

export const TranscriptSegment = z.object({
  id: z.string(),
  speaker: z.enum(["client", "rep"]),
  name: z.string(),
  text: z.string(),
  atSec: z.number(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const SourceRef = z.object({
  title: z.string(),
  version: z.string(),
  section: z.string(),
  passage: z.string(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const cardKinds = [
  "answer",
  "not_confirmed",
  "objection",
  "contradiction",
  "next_question",
] as const;
export const CallCard = z.object({
  id: z.string(),
  kind: z.enum(cardKinds),
  text: z.string(),
  source: SourceRef.nullable(),
  atSec: z.number(),
  verdict: z.enum(["useful", "wrong"]).nullable(),
});
export type CallCard = z.infer<typeof CallCard>;

export const Commitment = z.object({ text: z.string(), dueAt: isoDate });
export type Commitment = z.infer<typeof Commitment>;

export const CallSummary = z.object({
  callId: z.string(),
  status: z.enum(["draft", "approved"]),
  keyPoints: z.array(z.string()),
  clientQuestions: z.array(z.string()),
  commitments: z.array(Commitment),
  nextAction: z.string(),
  blocker: z.string(),
});
export type CallSummary = z.infer<typeof CallSummary>;

export const CallDetail = z.object({
  call: Call,
  transcript: z.array(TranscriptSegment),
  cards: z.array(CallCard),
  summary: CallSummary.nullable(),
});
export type CallDetail = z.infer<typeof CallDetail>;
