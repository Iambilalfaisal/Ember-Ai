import { z } from "zod";
import {
  AskBody,
  KnowledgeAnswer,
  KnowledgeDocument,
  ReplaceDocumentBody,
  Scorecard,
  UploadDocumentBody,
} from "../../domain";
import { getNow } from "../clock";
import { db, nextId } from "../db";
import { json, toDocument } from "../mappers";
import { notFound, route } from "./shared";

// The mock "search". It is deliberately simple: it matches the question against each section's words
// and against a few phrases people really ask. It stands in for the real retrieval, and it must never
// make the product look better than it will be, so anything it can't match returns Not confirmed.

const HINTS: Record<string, string[]> = {
  "Product overview|section 1": ["what does", "what is", "overview", "what do you do"],
  "Product overview|section 3": ["sap", "carrier portal", "connector", "integrate with"],
  "Integration guide|section 1": ["what do you need", "access", "technical contact"],
  "Integration guide|section 2": ["how long", "timeline", "phases", "weeks", "integration take"],
  "Integration guide|section 3": ["peak season", "freeze", "disrupt"],
  "Pricing guide|section 2": ["per site", "pricing", "price", "cost", "discount"],
  "Pricing guide|section 4": [
    "implementation fee",
    "implementation cost",
    "setup fee",
    "implementation price",
  ],
  "Security overview|section 1": ["encrypt", "protected", "secure is", "access control"],
  "Security overview|section 2": [
    "data residency",
    "where is our data",
    "where is data",
    "region",
    "backup",
  ],
  "Data handling FAQ|section 1": ["recording", "retention", "how long are", "kept for"],
  "Data handling FAQ|section 2": ["export", "delete our data", "delete data"],
  "ROI case study: regional manufacturer|section 1": [
    "roi",
    "return on investment",
    "payback",
    "case study",
  ],
  "Support and service levels|section 1": ["support", "response time", "sla", "service level"],
  "Implementation checklist|section 1": ["kickoff", "checklist", "before we start"],
  "Case study: work order automation|section 1": ["work order", "re-entry", "manual entry"],
};

const STOP = new Set([
  "the",
  "and",
  "you",
  "your",
  "for",
  "with",
  "have",
  "does",
  "what",
  "how",
  "long",
  "take",
  "this",
  "that",
  "are",
  "from",
  "can",
  "will",
  "our",
  "about",
  "there",
  "their",
  "they",
  "when",
  "which",
  "would",
]);

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const versionNumber = (version: string) => Number.parseInt(version.replace(/\D/g, ""), 10) || 0;

export const HOLDING_LINE = "I want to confirm that with our team and come back to you today.";

type Hit = { doc: KnowledgeDocument; heading: string; passage: string; score: number };

/** Answers from the active documents only. Exported so tests can check the rules directly. */
export function answerQuestion(question: string, documents: KnowledgeDocument[]): KnowledgeAnswer {
  const lower = question.toLowerCase();
  const tokens = [...new Set(words(question).filter((w) => w.length >= 4 && !STOP.has(w)))];

  const hits: Hit[] = documents
    .filter((d) => d.status === "active")
    .flatMap((doc) =>
      doc.sections.map((section) => {
        const text = new Set(words(`${doc.title} ${section.heading} ${section.passage}`));
        const hints = HINTS[`${doc.title}|${section.heading}`] ?? [];
        const score =
          tokens.filter((t) => text.has(t)).length +
          hints.filter((h) => lower.includes(h)).length * 3;
        return { doc, heading: section.heading, passage: section.passage, score };
      }),
    )
    .filter((h) => h.score >= 3)
    // The best match first. A newer version wins a tie, but an older active one still shows as a source.
    .sort(
      (a, b) => b.score - a.score || versionNumber(b.doc.version) - versionNumber(a.doc.version),
    );

  const best = hits[0];
  if (!best) {
    return {
      question,
      status: "not_confirmed",
      answer: null,
      holdingLine: HOLDING_LINE,
      sources: [],
      confidence: 0,
    };
  }
  return {
    question,
    status: "answered",
    answer: best.passage,
    holdingLine: null,
    sources: hits.slice(0, 2).map((h) => ({
      title: h.doc.title,
      version: h.doc.version,
      section: h.heading,
      passage: h.passage,
    })),
    confidence: Math.min(0.97, 0.5 + 0.08 * best.score),
  };
}

function getDoc(id: string) {
  return db.document.findFirst({ where: { id: { equals: id } } }) ?? notFound("The document");
}

export const knowledgeHandlers = [
  route("get", "/knowledge/documents", {
    run: () =>
      z
        .array(KnowledgeDocument)
        .parse(db.document.getAll().map(toDocument))
        .sort(
          (a, b) =>
            a.title.localeCompare(b.title) || versionNumber(b.version) - versionNumber(a.version),
        ),
  }),

  // A mock upload: the document is added, and it is not searchable until the real service indexes it.
  route("post", "/knowledge/documents", {
    roles: ["admin"],
    body: UploadDocumentBody,
    run: ({ user, body }) =>
      toDocument(
        db.document.create({
          id: nextId("doc"),
          title: body.title,
          docType: body.docType,
          version: "v1",
          status: "active",
          updatedAt: getNow().toISOString(),
          ownerId: user.id,
          sectionsJson: json([
            { heading: "section 1", passage: "Uploaded. The text is being indexed." },
          ]),
        }),
      ),
  }),

  // A new version replaces the old one: the old version is switched off and the new one is active.
  route("post", "/knowledge/documents/:id/replace", {
    roles: ["admin"],
    body: ReplaceDocumentBody,
    run: ({ user, params, body }) => {
      const old = getDoc(params["id"] ?? "");
      db.document.update({ where: { id: { equals: old.id } }, data: { status: "inactive" } });
      return toDocument(
        db.document.create({
          id: nextId("doc"),
          title: body.title ?? old.title,
          docType: old.docType,
          version: `v${versionNumber(old.version) + 1}`,
          status: "active",
          updatedAt: getNow().toISOString(),
          ownerId: user.id,
          sectionsJson: old.sectionsJson,
        }),
      );
    },
  }),

  route("post", "/knowledge/documents/:id/deactivate", {
    roles: ["admin"],
    run: ({ params }) =>
      toDocument(
        db.document.update({
          where: { id: { equals: params["id"] ?? "" } },
          data: { status: "inactive" },
        }) ?? notFound("The document"),
      ),
  }),

  route("post", "/knowledge/documents/:id/activate", {
    roles: ["admin"],
    run: ({ params }) =>
      toDocument(
        db.document.update({
          where: { id: { equals: params["id"] ?? "" } },
          data: { status: "active", updatedAt: getNow().toISOString() },
        }) ?? notFound("The document"),
      ),
  }),

  route("post", "/knowledge/ask", {
    body: AskBody,
    run: ({ body }) => {
      const documents = db.document.getAll().map(toDocument);
      return KnowledgeAnswer.parse(answerQuestion(body.question, documents));
    },
  }),

  route("get", "/knowledge/scorecard", {
    roles: ["lead", "admin"],
    run: () =>
      Scorecard.parse({
        runAt: new Date(getNow().getTime() - 2 * 86_400_000).toISOString(),
        questions: 120,
        correct: 0.91,
        grounded: 0.95,
        notConfirmedAccuracy: 0.93,
        latencyP50Ms: 1180,
        latencyP95Ms: 2240,
      }),
  }),
];
