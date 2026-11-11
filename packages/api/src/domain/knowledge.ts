import { z } from "zod";
import { SourceRef } from "./calls";
import { isoDate } from "./common";

export const documentTypes = [
  "guide",
  "faq",
  "pricing",
  "security",
  "case_study",
  "policy",
] as const;

export const KnowledgeSection = z.object({ heading: z.string(), passage: z.string() });

export const KnowledgeDocument = z.object({
  id: z.string(),
  title: z.string(),
  docType: z.enum(documentTypes),
  version: z.string(),
  status: z.enum(["active", "inactive"]),
  updatedAt: isoDate,
  ownerId: z.string(),
  sections: z.array(KnowledgeSection),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocument>;

export const KnowledgeAnswer = z.object({
  question: z.string(),
  status: z.enum(["answered", "not_confirmed"]),
  /** Null when the status is not_confirmed. */
  answer: z.string().nullable(),
  /** A line the rep can say instead. Only present when not confirmed. */
  holdingLine: z.string().nullable(),
  sources: z.array(SourceRef),
  /** 0 to 1. */
  confidence: z.number(),
});
export type KnowledgeAnswer = z.infer<typeof KnowledgeAnswer>;

export const Scorecard = z.object({
  runAt: isoDate,
  questions: z.number().int(),
  correct: z.number(),
  grounded: z.number(),
  notConfirmedAccuracy: z.number(),
  latencyP50Ms: z.number(),
  latencyP95Ms: z.number(),
});
export type Scorecard = z.infer<typeof Scorecard>;
