import {
  Call,
  CallBrief,
  CallCard,
  CallSummary,
  Contact,
  Deal,
  DiscoveryNotes,
  Draft,
  Interaction,
  KnowledgeDocument,
  Participant,
  Settings,
  SourceRef,
  Task,
  TranscriptSegment,
  User,
  Commitment,
  KnowledgeSection,
} from "../domain";
import { z } from "zod";
import type { Row } from "./db";

// Rows in the db are flat. These turn them into the typed objects of the API contract, and parsing
// with the Zod schemas means the mock can never return something the contract does not describe.

export const toUser = (row: Row<"user">) => User.parse(row);
export const toContact = (row: Row<"contact">) => Contact.parse(row);
export const toDeal = (row: Row<"deal">) => Deal.parse(row);
export const toInteraction = (row: Row<"interaction">) => Interaction.parse(row);
export const toTask = (row: Row<"task">) => Task.parse(row);
export const toDraft = (row: Row<"draft">) => Draft.parse(row);
export const toBrief = (row: Row<"brief">) => CallBrief.parse(row);
export const toSegment = (row: Row<"segment">) => TranscriptSegment.parse(row);

export const toNotes = (row: Row<"notes">) =>
  DiscoveryNotes.parse({
    dealId: row.dealId,
    text: row.text,
    highlights: row.highlights,
    extracted: { openQuestion: row.openQuestion, nextAction: row.nextAction, blocker: row.blocker },
  });

export const toCall = (row: Row<"call">, company: string) =>
  Call.parse({
    ...row,
    company,
    participants: z.array(Participant).parse(JSON.parse(row.participantsJson)),
  });

export const toCard = (row: Row<"card">) =>
  CallCard.parse({
    ...row,
    source: row.sourceJson ? SourceRef.parse(JSON.parse(row.sourceJson)) : null,
  });

export const toSummary = (row: Row<"summary">) =>
  CallSummary.parse({
    ...row,
    commitments: z.array(Commitment).parse(JSON.parse(row.commitmentsJson)),
  });

export const toDocument = (row: Row<"document">) =>
  KnowledgeDocument.parse({
    ...row,
    sections: z.array(KnowledgeSection).parse(JSON.parse(row.sectionsJson)),
  });

export const toSettings = (row: Row<"settings">) => Settings.parse(JSON.parse(row.json));

export const json = (value: unknown): string => JSON.stringify(value);
