import { z } from "zod";
import { Call } from "./calls";
import { isoDate } from "./common";

// The copilot module: what it noticed, what it proposes, what a person approved, and what changed.

/** What a person approved or did, as the audit log records it. */
export const auditActions = [
  "next_action_set",
  "draft_created",
  "draft_sent",
  "tasks_created",
  "stage_changed",
  "call_logged",
  "owner_assigned",
  "opted_out",
  "deal_revived",
] as const;
export const AuditAction = z.enum(auditActions);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEntry = z.object({
  id: z.string(),
  at: isoDate,
  dealId: z.string(),
  company: z.string(),
  action: AuditAction,
  summary: z.string(),
  /** Who approved it. Nothing the copilot proposes is applied without a name here. */
  approvedBy: z.string(),
  /** Whether the copilot proposed it or the person did it on their own. */
  via: z.enum(["copilot", "manual"]),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const suggestionKinds = [
  "set_next_action",
  "nudge_draft",
  "revive",
  "assign_owner",
] as const;
export const SuggestionKind = z.enum(suggestionKinds);
export type SuggestionKind = z.infer<typeof SuggestionKind>;

/** Something the copilot noticed and proposes. It changes nothing until a person approves it. */
export const Suggestion = z.object({
  id: z.string(),
  dealId: z.string(),
  company: z.string(),
  kind: SuggestionKind,
  title: z.string(),
  /** The reason, in one sentence. */
  why: z.string(),
  /** The facts it rests on, shown as chips. */
  facts: z.array(z.string()),
  /** What approving does, in words. */
  proposedAction: z.string(),
  proposedDueAt: isoDate.nullable(),
  state: z.enum(["pending", "approved", "dismissed"]),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const DigestHighlight = z.object({
  dealId: z.string(),
  company: z.string(),
  text: z.string(),
});

export const Digest = z.object({
  /** "Good morning, Sam". */
  greeting: z.string(),
  headline: z.string(),
  counts: z.object({
    needYou: z.number().int(),
    overdue: z.number().int(),
    noNextAction: z.number().int(),
    callsToday: z.number().int(),
    suggestions: z.number().int(),
    revival: z.number().int(),
  }),
  highlights: z.array(DigestHighlight),
  nextCall: Call.nullable(),
});
export type Digest = z.infer<typeof Digest>;

export const callChannels = ["phone", "whatsapp", "video", "in_person"] as const;
export const LogCallBody = z.object({
  channel: z.enum(callChannels),
  summary: z.string().min(3),
  /** One promise per line. Each becomes a task the rep owns. */
  commitments: z.array(z.string().min(1)).default([]),
  nextAction: z.string().nullable().default(null),
});
export type LogCallBody = z.infer<typeof LogCallBody>;

export const LogCallResult = z.object({
  interactionId: z.string(),
  tasksCreated: z.number().int(),
});
export type LogCallResult = z.infer<typeof LogCallResult>;

export const NotificationPrefs = z.object({
  digestInApp: z.boolean(),
  digestEmail: z.boolean(),
  remindersInApp: z.boolean(),
  remindersEmail: z.boolean(),
  /** Local hour the morning digest goes out. */
  digestHour: z.number().int().min(0).max(23),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;
