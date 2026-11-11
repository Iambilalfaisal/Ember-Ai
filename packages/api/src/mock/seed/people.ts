import { faker } from "@faker-js/faker";
import { db } from "../db";
import { addDays, subDays } from "date-fns";
import { composeDraft } from "./drafts";

export type SeedContext = {
  now: Date;
  /** The seller's company name. It appears in email addresses. */
  company: string;
};

export const iso = (date: Date) => date.toISOString();
export const daysAgo = (ctx: SeedContext, days: number) => iso(subDays(ctx.now, days));
export const daysAhead = (ctx: SeedContext, days: number) => iso(addDays(ctx.now, days));

/** Today at a given UTC hour, for calls that happen today. */
export function today(ctx: SeedContext, hour: number, minute = 0): string {
  const d = new Date(ctx.now);
  d.setUTCHours(hour, minute, 0, 0);
  return iso(d);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const USERS = [
  { id: "sam", name: "Sam Okafor", initials: "SO", role: "rep" },
  { id: "jules", name: "Jules Park", initials: "JP", role: "rep" },
  { id: "priya", name: "Priya Nair", initials: "PN", role: "lead" },
  { id: "alex", name: "Alex Morgan", initials: "AM", role: "admin" },
] as const;

type DealSeed = {
  id: string;
  company: string;
  stage: string;
  value: number;
  ownerId: string | null;
  heat: "warm" | "cooling" | "cold";
  status: string;
  lastActivityDaysAgo: number;
  lastActivityNote: string;
  nextAction: string | null;
  blocker: string | null;
  contact: { name: string; title: string };
  originalNeed?: string;
  wayBackIn?: string;
  createdDaysAgo: number;
};

const DEALS: DealSeed[] = [
  {
    id: "meridian",
    company: "Meridian Robotics",
    stage: "discovery",
    value: 84000,
    ownerId: "sam",
    heat: "cooling",
    status: "needs_attention",
    lastActivityDaysAgo: 6,
    lastActivityNote: "Discovery call with Priya Shah",
    nextAction: "Share the ROI case study",
    blocker: "Waiting on ROI numbers for the board",
    contact: { name: "Priya Shah", title: "VP Engineering" },
    createdDaysAgo: 21,
  },
  {
    id: "blue-harbor",
    company: "Blue Harbor Logistics",
    stage: "qualified",
    value: 120000,
    ownerId: "sam",
    heat: "cooling",
    status: "needs_attention",
    lastActivityDaysAgo: 9,
    lastActivityNote: "Intro call with Tom Reyes",
    nextAction: "Send the integration timeline",
    blocker: null,
    contact: { name: "Tom Reyes", title: "Director of Operations" },
    createdDaysAgo: 30,
  },
  {
    id: "ferro",
    company: "Ferro Analytics",
    stage: "qualified",
    value: 56000,
    ownerId: "sam",
    heat: "cooling",
    status: "needs_attention",
    lastActivityDaysAgo: 4,
    lastActivityNote: "Sent the security questionnaire",
    nextAction: "Check in on the security questionnaire",
    blocker: "Security review not started on their side",
    contact: { name: "Marcus Lindqvist", title: "Head of Data" },
    createdDaysAgo: 26,
  },
  {
    id: "solvex",
    company: "Solvex Manufacturing",
    stage: "proposal",
    value: 210000,
    ownerId: "sam",
    heat: "cooling",
    status: "needs_attention",
    lastActivityDaysAgo: 8,
    lastActivityNote: "Proposal sent to Dana Whitfield",
    nextAction: "Ask whether legal has questions",
    blocker: "No reply since the proposal went out",
    contact: { name: "Dana Whitfield", title: "COO" },
    createdDaysAgo: 48,
  },
  {
    id: "nimbus",
    company: "Nimbus Freight",
    stage: "discovery",
    value: 64000,
    ownerId: null,
    heat: "cooling",
    status: "unassigned",
    lastActivityDaysAgo: 3,
    lastActivityNote: "Inbound request from the website",
    nextAction: null,
    blocker: null,
    contact: { name: "Owen Barrett", title: "Head of Operations" },
    createdDaysAgo: 3,
  },
  {
    id: "highline",
    company: "Highline Freight",
    stage: "negotiation",
    value: 175000,
    ownerId: "jules",
    heat: "warm",
    status: "on_track",
    lastActivityDaysAgo: 1,
    lastActivityNote: "Pricing call with Rosa Delgado",
    nextAction: "Send the revised order form",
    blocker: null,
    contact: { name: "Rosa Delgado", title: "VP Supply Chain" },
    createdDaysAgo: 62,
  },
  {
    id: "coastal",
    company: "Coastal Parcel Systems",
    stage: "qualified",
    value: 92000,
    ownerId: "jules",
    heat: "cold",
    status: "revival",
    lastActivityDaysAgo: 118,
    lastActivityNote: "Paused until their system migration finished",
    nextAction: null,
    blocker: null,
    contact: { name: "Hana Ito", title: "Director of IT" },
    originalNeed: "Connect parcel tracking to their new warehouse system",
    wayBackIn:
      "Their migration should be done by now. Ask how tracking is working and share the integration guide.",
    createdDaysAgo: 160,
  },
  {
    id: "tarnhelm",
    company: "Tarnhelm Industrial",
    stage: "discovery",
    value: 70000,
    ownerId: "sam",
    heat: "cold",
    status: "revival",
    lastActivityDaysAgo: 140,
    lastActivityNote: "Went quiet after the first demo",
    nextAction: null,
    blocker: null,
    contact: { name: "Elias Brandt", title: "Plant Manager" },
    originalNeed: "Cut manual re-entry of work orders between two systems",
    wayBackIn:
      "Share the case study on work order automation and ask if re-entry is still a problem.",
    createdDaysAgo: 175,
  },
  {
    id: "ridgeline",
    company: "Ridgeline Foods",
    stage: "qualified",
    value: 48000,
    ownerId: "jules",
    heat: "cold",
    status: "revival",
    lastActivityDaysAgo: 96,
    lastActivityNote: "Budget freeze announced",
    nextAction: null,
    blocker: null,
    contact: { name: "Mara Voss", title: "Finance Director" },
    originalNeed: "Faster month-end reporting across three plants",
    wayBackIn:
      "Their new financial year has started. Ask if the freeze has lifted and offer a short call.",
    createdDaysAgo: 140,
  },
  {
    id: "fernbridge",
    company: "Fernbridge Health",
    stage: "lost",
    value: 130000,
    ownerId: "sam",
    heat: "cold",
    status: "declined",
    lastActivityDaysAgo: 75,
    lastActivityNote: "Contact asked us to stop emailing",
    nextAction: null,
    blocker: null,
    contact: { name: "Gwen Ashby", title: "Head of Procurement" },
    originalNeed: "Consolidate supplier onboarding",
    wayBackIn: "Not used. The contact opted out.",
    createdDaysAgo: 120,
  },
];

export function seedPeopleAndDeals(ctx: SeedContext): void {
  faker.seed(20260101);
  const domain = `${slug(ctx.company)}.example`;

  for (const user of USERS) {
    db.user.create({ ...user, email: `${slug(user.name.split(" ")[0] ?? user.id)}@${domain}` });
  }

  for (const deal of DEALS) {
    const contactId = `c-${deal.id}`;
    db.contact.create({
      id: contactId,
      dealId: deal.id,
      name: deal.contact.name,
      title: deal.contact.title,
      email: `${slug(deal.contact.name)}@${slug(deal.company)}.example`,
      phone: faker.phone.number({ style: "international" }),
    });
    db.deal.create({
      id: deal.id,
      company: deal.company,
      stage: deal.stage,
      value: deal.value,
      ownerId: deal.ownerId,
      heat: deal.heat,
      status: deal.status,
      lastActivityAt: daysAgo(ctx, deal.lastActivityDaysAgo),
      lastActivityNote: deal.lastActivityNote,
      nextAction: deal.nextAction,
      blocker: deal.blocker,
      primaryContactId: contactId,
      originalNeed: deal.originalNeed ?? null,
      wayBackIn: deal.wayBackIn ?? null,
      createdAt: daysAgo(ctx, deal.createdDaysAgo),
    });
    // A second contact on the larger deals, so the contacts list has some depth.
    if (deal.value >= 100000) {
      const name = faker.person.fullName();
      db.contact.create({
        id: `c-${deal.id}-2`,
        dealId: deal.id,
        name,
        title: faker.helpers.arrayElement(["IT Lead", "Procurement Manager", "Finance Lead"]),
        email: `${slug(name)}@${slug(deal.company)}.example`,
        phone: null,
      });
    }
  }
}

// My Day items, discovery notes and drafts for the four deals that need Sam today.

type AttentionSeed = {
  dealId: string;
  reason: string;
  suggestedAction: string;
  overdueDays: number;
  notes?: {
    text: string;
    highlights: string[];
    openQuestion: string;
    nextAction: string;
    blocker: string;
  };
  draftTopic: string;
  draftFact: string;
};

const ATTENTION: AttentionSeed[] = [
  {
    dealId: "meridian",
    reason:
      "Priya asked for ROI evidence on the discovery call. No next action has been set since.",
    suggestedAction: "Share the ROI case study",
    overdueDays: 6,
    notes: {
      text: "Priya runs the robotics platform team. They lose about two days a week to manual calibration reports. Board review is next month, so she needs ROI numbers she can put in front of the CFO. Their ERP is the main constraint on timing. She asked if we have a similar case study.",
      highlights: [
        "manual calibration reports",
        "ROI numbers",
        "Board review is next month",
        "similar case study",
      ],
      openQuestion: "Do we have a case study with similar ROI numbers?",
      nextAction: "Share the ROI case study",
      blocker: "Waiting on ROI numbers for the board",
    },
    draftTopic: "ROI case study",
    draftFact:
      "A manufacturer with a similar setup cut report preparation from two days to two hours.",
  },
  {
    dealId: "blue-harbor",
    reason: "Tom asked about the integration timeline on the last call. No reply yet.",
    suggestedAction: "Send the integration timeline",
    overdueDays: 9,
    notes: {
      text: "Tom owns operations across four regional distribution sites. Their carrier portal and an SAP ERP are the two systems that must connect. He wants to know how long integration takes before he takes it to his IT lead. Price came up once; they have seen another vendor.",
      highlights: [
        "four regional distribution sites",
        "SAP ERP",
        "how long integration takes",
        "another vendor",
      ],
      openQuestion: "How long does integration take with SAP?",
      nextAction: "Send the integration timeline",
      blocker: "IT lead has not been looped in yet",
    },
    draftTopic: "Integration timeline",
    draftFact:
      "Integration runs in three phases over six to eight weeks, with the ERP connector first.",
  },
  {
    dealId: "ferro",
    reason: "Marcus asked for the security questionnaire. It was sent 4 days ago with no reply.",
    suggestedAction: "Check in on the security questionnaire",
    overdueDays: 2,
    notes: {
      text: "Marcus leads a five-person data team. Any new vendor goes through a security review first, and he said the questionnaire is the first step. He prefers short emails.",
      highlights: ["security review", "questionnaire", "short emails"],
      openQuestion: "Who reviews the questionnaire on their side?",
      nextAction: "Check in on the security questionnaire",
      blocker: "Security review not started on their side",
    },
    draftTopic: "Security questionnaire",
    draftFact: "The completed questionnaire was sent on Friday.",
  },
  {
    dealId: "solvex",
    reason: "The proposal went out 8 days ago and nobody has replied.",
    suggestedAction: "Ask whether legal has questions",
    overdueDays: 3,
    notes: {
      text: "Dana is the buyer and signs off alone up to 250,000 dollars, but legal reviews all vendor terms. She said the proposal looked right and she would loop in legal.",
      highlights: ["signs off alone", "legal reviews all vendor terms", "loop in legal"],
      openQuestion: "Has legal received the proposal?",
      nextAction: "Ask whether legal has questions",
      blocker: "No reply since the proposal went out",
    },
    draftTopic: "Proposal review",
    draftFact:
      "The proposal was sent last week and includes the standard terms legal usually reviews.",
  },
];

export function seedAttention(ctx: SeedContext): void {
  for (const item of ATTENTION) {
    const deal = DEALS.find((d) => d.id === item.dealId);
    if (!deal) continue;
    db.myDay.create({
      id: `md-${item.dealId}`,
      dealId: item.dealId,
      userId: "sam",
      reason: item.reason,
      suggestedAction: item.suggestedAction,
      overdueDays: item.overdueDays,
      state: "open",
    });
    if (item.notes) {
      db.notes.create({
        dealId: item.dealId,
        text: item.notes.text,
        highlights: item.notes.highlights,
        openQuestion: item.notes.openQuestion,
        nextAction: item.notes.nextAction,
        blocker: item.notes.blocker,
      });
    }
    const content = composeDraft(
      {
        firstName: deal.contact.name.split(" ")[0] ?? "",
        company: deal.company,
        topic: item.draftTopic,
        fact: item.draftFact,
        senderFirstName: "Sam",
      },
      1,
    );
    db.draft.create({
      id: `dr-${item.dealId}`,
      dealId: item.dealId,
      kind: "follow_up",
      subject: content.subject,
      body: content.body,
      factsUsed: content.factsUsed,
      status: "draft",
      version: 1,
    });
  }
  void ctx;
}

export function seedInteractionsAndTasks(ctx: SeedContext): void {
  const timeline: [
    string,
    "call" | "email" | "note" | "stage_change",
    number,
    string,
    string | null,
  ][] = [
    ["meridian", "stage_change", 21, "Moved to Discovery", "sam"],
    ["meridian", "email", 14, "Sent the intro deck to Priya", "sam"],
    ["meridian", "call", 6, "Discovery call. Priya asked for ROI evidence.", "sam"],
    ["blue-harbor", "stage_change", 30, "Moved to Discovery", "sam"],
    ["blue-harbor", "email", 20, "Sent the product overview", "sam"],
    [
      "blue-harbor",
      "call",
      9,
      "Intro call. Tom asked about integration and mentioned another vendor.",
      "sam",
    ],
    ["blue-harbor", "stage_change", 9, "Moved to Qualified", "sam"],
    ["ferro", "call", 12, "First call with Marcus about the data platform", "sam"],
    ["ferro", "email", 4, "Sent the security questionnaire", "sam"],
    ["solvex", "call", 20, "Proposal walkthrough with Dana", "sam"],
    ["solvex", "stage_change", 8, "Moved to Proposal", "sam"],
    ["solvex", "email", 8, "Sent the proposal", "sam"],
    ["nimbus", "note", 3, "Inbound request from the website. Nobody has contacted them.", null],
    ["highline", "call", 9, "Pricing call with Rosa", "jules"],
    ["highline", "email", 5, "Sent the first order form", "jules"],
    ["highline", "call", 1, "Pricing call with Rosa. Agreed the scope.", "jules"],
    ["coastal", "note", 118, "Paused until their system migration finished", "jules"],
    ["tarnhelm", "note", 140, "Went quiet after the first demo", "sam"],
    ["ridgeline", "note", 96, "Budget freeze announced", "jules"],
    ["fernbridge", "email", 75, "Contact asked us to stop emailing", "sam"],
  ];
  timeline.forEach(([dealId, type, days, summary, userId], i) => {
    db.interaction.create({
      id: `i-${i + 1}`,
      dealId,
      type,
      at: daysAgo(ctx, days),
      summary,
      userId,
      callId: null,
    });
  });

  const tasks: [string, string, number, string, "open" | "done"][] = [
    ["meridian", "Send the ROI case study to Priya", 0, "sam", "open"],
    ["blue-harbor", "Send the integration timeline to Tom", -2, "sam", "open"],
    ["ferro", "Check in with Marcus on the questionnaire", 1, "sam", "open"],
    ["solvex", "Ask Dana whether legal has questions", 1, "sam", "open"],
    ["highline", "Send the revised order form to Rosa", 2, "jules", "open"],
    ["highline", "Book the contract review call", 4, "jules", "open"],
    ["ferro", "Complete the security questionnaire", -4, "sam", "done"],
    ["solvex", "Send the proposal", -8, "sam", "done"],
  ];
  tasks.forEach(([dealId, title, due, ownerId, status], i) => {
    db.task.create({
      id: `t-${i + 1}`,
      dealId,
      title,
      dueAt: iso(addDays(ctx.now, due)),
      ownerId,
      status,
      source: "manual",
    });
  });
}
