import { z } from "zod";
import { ContactRole, ContactStatus } from "./common";
import { Contact } from "./people";
import { Deal, Draft, Task } from "./deals";
import { CallCard, CallSummary, Commitment, TranscriptSegment } from "./calls";
import { Stage } from "./common";
import { documentTypes } from "./knowledge";

// Request bodies and a few response shapes that are not plain resources.

export const ActionResult = z.object({ id: z.string(), state: z.string() });
export type ActionResult = z.infer<typeof ActionResult>;

export const SnoozeBody = z.object({ days: z.number().int().min(1).max(30) });

export const UpdateDealBody = z.object({
  stage: Stage.optional(),
  /** Null leaves the opportunity unassigned. */
  ownerId: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  blocker: z.string().nullable().optional(),
  nextActionDueAt: z.iso.datetime().nullable().optional(),
  source: z.string().nullable().optional(),
  /** Required when the stage becomes won or lost. */
  closeReason: z.string().min(1).optional(),
});
export type UpdateDealBody = z.infer<typeof UpdateDealBody>;

export const UpdateNotesBody = z.object({
  openQuestion: z.string().optional(),
  nextAction: z.string().optional(),
  blocker: z.string().optional(),
});
export type UpdateNotesBody = z.infer<typeof UpdateNotesBody>;

export const UpdateDraftBody = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});
export type UpdateDraftBody = z.infer<typeof UpdateDraftBody>;

export const UpdateTaskBody = z.object({ status: z.enum(["open", "done"]) });

export const UpdateSummaryBody = z.object({
  keyPoints: z.array(z.string()).optional(),
  clientQuestions: z.array(z.string()).optional(),
  commitments: z.array(Commitment).optional(),
  nextAction: z.string().optional(),
  blocker: z.string().optional(),
});
export type UpdateSummaryBody = z.infer<typeof UpdateSummaryBody>;

/** Sent when a call ends, so the library keeps what happened on the call. */
export const EndCallBody = z.object({
  transcript: z.array(TranscriptSegment).optional(),
  cards: z.array(CallCard).optional(),
  durationMin: z.number().int().optional(),
});
export type EndCallBody = z.infer<typeof EndCallBody>;

export const CardFeedbackBody = z.object({ verdict: z.enum(["useful", "wrong"]) });

export const ApproveSummaryResult = z.object({
  summary: CallSummary,
  createdTasks: z.array(Task),
  followUp: Draft,
});
export type ApproveSummaryResult = z.infer<typeof ApproveSummaryResult>;

export const ContactRow = z.object({ contact: Contact, company: z.string(), dealId: z.string() });
export type ContactRow = z.infer<typeof ContactRow>;

export const TaskRow = z.object({ task: Task, company: z.string() });
export type TaskRow = z.infer<typeof TaskRow>;

export const DealRow = z.object({ deal: Deal, contact: Contact });
export type DealRow = z.infer<typeof DealRow>;

export const UploadDocumentBody = z.object({
  title: z.string().min(1),
  docType: z.enum(documentTypes),
});
export const ReplaceDocumentBody = z.object({ title: z.string().optional() });

export const AskBody = z.object({ question: z.string().min(3) });

export const UpdateSettingsBody = z.object({
  followUpDays: z.partialRecord(Stage, z.number().int()).optional(),
  recordingConsent: z.enum(["required", "announce", "off"]).optional(),
  retentionDays: z.number().int().optional(),
  sources: z.array(z.string().min(1)).min(1).optional(),
  lostReasons: z.array(z.string().min(1)).min(1).optional(),
  timeZone: z.string().min(1).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  defaultCurrency: z.string().min(3).optional(),
});
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

export const CreateDealBody = z.object({
  company: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().min(1),
  contactTitle: z.string().default(""),
  value: z.number().nonnegative().default(0),
  source: z.string().nullable().default(null),
  currency: z.string().default("USD"),
});
export type CreateDealBody = z.infer<typeof CreateDealBody>;

export const ImportDealsBody = z.object({ rows: z.array(CreateDealBody).max(500) });
export type ImportDealsBody = z.infer<typeof ImportDealsBody>;

export const ImportResult = z.object({
  created: z.number().int(),
  skipped: z.array(z.object({ row: z.number().int(), reason: z.string() })),
});
export type ImportResult = z.infer<typeof ImportResult>;

export const UpdateContactBody = z.object({
  role: ContactRole.optional(),
  status: ContactStatus.optional(),
});
export type UpdateContactBody = z.infer<typeof UpdateContactBody>;
