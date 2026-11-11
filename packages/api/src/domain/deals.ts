import { z } from "zod";
import { Call } from "./calls";
import { DealStatus, Heat, Stage, isoDate } from "./common";
import { Contact, User } from "./people";

export const Deal = z.object({
  id: z.string(),
  company: z.string(),
  stage: Stage,
  /** Annual contract value in US dollars. */
  value: z.number(),
  ownerId: z.string().nullable(),
  heat: Heat,
  status: DealStatus,
  lastActivityAt: isoDate,
  lastActivityNote: z.string(),
  nextAction: z.string().nullable(),
  blocker: z.string().nullable(),
  primaryContactId: z.string(),
  /** Revival candidates only: what the buyer needed in the first place, and a way back in. */
  originalNeed: z.string().nullable(),
  wayBackIn: z.string().nullable(),
  createdAt: isoDate,
});
export type Deal = z.infer<typeof Deal>;

export const interactionTypes = ["call", "email", "note", "stage_change"] as const;
export const Interaction = z.object({
  id: z.string(),
  dealId: z.string(),
  type: z.enum(interactionTypes),
  at: isoDate,
  summary: z.string(),
  userId: z.string().nullable(),
  callId: z.string().nullable(),
});
export type Interaction = z.infer<typeof Interaction>;

export const Task = z.object({
  id: z.string(),
  dealId: z.string(),
  title: z.string(),
  dueAt: isoDate,
  ownerId: z.string(),
  status: z.enum(["open", "done"]),
  source: z.enum(["manual", "call_summary", "follow_up"]),
});
export type Task = z.infer<typeof Task>;

export const DiscoveryNotes = z.object({
  dealId: z.string(),
  text: z.string(),
  /** Phrases from the text to highlight. */
  highlights: z.array(z.string()),
  extracted: z.object({
    openQuestion: z.string(),
    nextAction: z.string(),
    blocker: z.string(),
  }),
});
export type DiscoveryNotes = z.infer<typeof DiscoveryNotes>;

export const Draft = z.object({
  id: z.string(),
  dealId: z.string(),
  kind: z.enum(["follow_up", "post_call"]),
  subject: z.string(),
  body: z.string(),
  /** The facts the draft rests on, shown as chips. */
  factsUsed: z.array(z.string()),
  status: z.enum(["draft", "sent"]),
  /** Counts regenerations, starting at 1. */
  version: z.number().int(),
  sentAt: isoDate.nullable(),
});
export type Draft = z.infer<typeof Draft>;

// My Day

export const MyDayItem = z.object({
  id: z.string(),
  deal: Deal,
  contact: Contact,
  reason: z.string(),
  suggestedAction: z.string(),
  /** Days past the follow-up date. Zero when it is due today. */
  overdueDays: z.number().int(),
  hasDraft: z.boolean(),
  hasNotes: z.boolean(),
});
export type MyDayItem = z.infer<typeof MyDayItem>;

export const MyDay = z.object({
  items: z.array(MyDayItem),
  counts: z.object({ needYou: z.number().int(), callsToday: z.number().int() }),
  calls: z.array(Call),
});
export type MyDay = z.infer<typeof MyDay>;

// Team view and revival

export const TeamRow = z.object({
  deal: Deal,
  owner: User.nullable(),
  reason: z.string(),
});
export type TeamRow = z.infer<typeof TeamRow>;

export const TeamView = z.object({
  rows: z.array(TeamRow),
  reps: z.array(User),
});
export type TeamView = z.infer<typeof TeamView>;

export const RevivalItem = z.object({
  deal: Deal,
  contact: Contact,
  originalNeed: z.string(),
  wayBackIn: z.string(),
});
export const RevivalQueue = z.object({
  items: z.array(RevivalItem),
  /** Opportunities left out because the contact declined or opted out. */
  excludedCount: z.number().int(),
});
export type RevivalQueue = z.infer<typeof RevivalQueue>;

// Deal detail

export const DealDetail = z.object({
  deal: Deal,
  owner: User.nullable(),
  contacts: z.array(Contact),
  interactions: z.array(Interaction),
  tasks: z.array(Task),
  latestSummary: z.string().nullable(),
  upcomingCall: Call.nullable(),
});
export type DealDetail = z.infer<typeof DealDetail>;
