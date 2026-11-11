import { drop, factory, nullable, primaryKey } from "@mswjs/data";

// The in-memory database behind the mock API. Models hold flat values only (strings, numbers, string
// arrays). Nested objects are stored as JSON strings and turned back into typed objects, and checked
// against the Zod schemas, by mappers.ts. That is a limit of @mswjs/data, not of the API contract.

const models = {
  user: {
    id: primaryKey(String),
    name: String,
    initials: String,
    email: String,
    role: String,
  },
  contact: {
    id: primaryKey(String),
    dealId: String,
    name: String,
    title: String,
    email: String,
    phone: nullable<string>(() => null),
  },
  deal: {
    id: primaryKey(String),
    company: String,
    stage: String,
    value: Number,
    ownerId: nullable<string>(() => null),
    heat: String,
    status: String,
    lastActivityAt: String,
    lastActivityNote: String,
    nextAction: nullable<string>(() => null),
    blocker: nullable<string>(() => null),
    primaryContactId: String,
    originalNeed: nullable<string>(() => null),
    wayBackIn: nullable<string>(() => null),
    createdAt: String,
  },
  interaction: {
    id: primaryKey(String),
    dealId: String,
    type: String,
    at: String,
    summary: String,
    userId: nullable<string>(() => null),
    callId: nullable<string>(() => null),
  },
  task: {
    id: primaryKey(String),
    dealId: String,
    title: String,
    dueAt: String,
    ownerId: String,
    status: String,
    source: String,
  },
  notes: {
    dealId: primaryKey(String),
    text: String,
    highlights: () => [] as string[],
    openQuestion: String,
    nextAction: String,
    blocker: String,
  },
  draft: {
    id: primaryKey(String),
    dealId: String,
    kind: String,
    subject: String,
    body: String,
    factsUsed: () => [] as string[],
    status: String,
    version: Number,
    sentAt: nullable<string>(() => null),
  },
  myDay: {
    id: primaryKey(String),
    dealId: String,
    userId: String,
    reason: String,
    suggestedAction: String,
    overdueDays: Number,
    state: String,
    snoozedUntil: nullable<string>(() => null),
  },
  call: {
    id: primaryKey(String),
    dealId: String,
    title: String,
    startsAt: String,
    durationMin: Number,
    status: String,
    repId: String,
    participantsJson: String,
    outcome: nullable<string>(() => null),
    scenarioId: nullable<string>(() => null),
  },
  brief: {
    callId: primaryKey(String),
    accountSummary: String,
    openQuestions: () => [] as string[],
    commitments: () => [] as string[],
    likelyObjections: () => [] as string[],
    agenda: () => [] as string[],
  },
  segment: {
    id: primaryKey(String),
    callId: String,
    speaker: String,
    name: String,
    text: String,
    atSec: Number,
  },
  card: {
    id: primaryKey(String),
    callId: String,
    kind: String,
    text: String,
    sourceJson: nullable<string>(() => null),
    atSec: Number,
    verdict: nullable<string>(() => null),
  },
  summary: {
    callId: primaryKey(String),
    status: String,
    keyPoints: () => [] as string[],
    clientQuestions: () => [] as string[],
    commitmentsJson: String,
    nextAction: String,
    blocker: String,
  },
  document: {
    id: primaryKey(String),
    title: String,
    docType: String,
    version: String,
    status: String,
    updatedAt: String,
    ownerId: String,
    sectionsJson: String,
  },
  weekly: {
    weekStart: primaryKey(String),
    answersUsed: Number,
    answersCorrect: Number,
    techQuestionsHandled: Number,
    followUpMinutes: Number,
    dealsToProposal: Number,
  },
  overdue: {
    id: primaryKey(String),
    weekStart: String,
    repId: String,
    overdue: Number,
  },
  settings: {
    id: primaryKey(String),
    json: String,
  },
};

export type Models = typeof models;
export type Db = ReturnType<typeof factory<Models>>;
export type Row<K extends keyof Models> = Db[K] extends { getAll: () => (infer R)[] } ? R : never;

export const db: Db = factory(models);

/** Empties every model. The seed runs again after this to restore the demo. */
export function clearDb(): void {
  drop(db);
}

let counter = 0;

/** Ids for rows created while the demo runs. Seeded rows have readable ids of their own. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export function resetCounter(): void {
  counter = 0;
}
