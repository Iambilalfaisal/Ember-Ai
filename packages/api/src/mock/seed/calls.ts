import { db } from "../db";
import { json } from "../mappers";
import { daysAgo, today, type SeedContext } from "./people";

type Line = [speaker: "client" | "rep", text: string];

type CompletedCall = {
  id: string;
  dealId: string;
  title: string;
  daysAgo: number;
  repId: string;
  client: { name: string; role: string };
  outcome: string;
  transcript: Line[];
};

const REP_NAMES: Record<string, string> = { sam: "Sam Okafor", jules: "Jules Park" };

// The previous Blue Harbor call is the one the live call contradicts: Tom says four sites here and
// six sites in the live call.
const COMPLETED: CompletedCall[] = [
  {
    id: "call-blue-harbor-intro",
    dealId: "blue-harbor",
    title: "Intro call",
    daysAgo: 9,
    repId: "sam",
    client: { name: "Tom Reyes", role: "Director of Operations" },
    outcome: "Qualified. Needs an integration timeline.",
    transcript: [
      [
        "rep",
        "Thanks for making the time, Tom. Can you tell me how your operation is set up today?",
      ],
      [
        "client",
        "We run four regional distribution sites. Most of the pain is between our carrier portal and SAP.",
      ],
      ["rep", "Is that manual re-entry, or does something sync them?"],
      ["client", "Manual. Two people spend half their day on it."],
      [
        "client",
        "I also need to know how long integration takes before I take this to my IT lead.",
      ],
      ["rep", "I will send you a timeline this week."],
    ],
  },
  {
    id: "call-meridian-discovery",
    dealId: "meridian",
    title: "Discovery call",
    daysAgo: 6,
    repId: "sam",
    client: { name: "Priya Shah", role: "VP Engineering" },
    outcome: "Needs ROI evidence for the board.",
    transcript: [
      ["rep", "What would make this worth doing for your team?"],
      [
        "client",
        "We lose about two days a week to calibration reports. If you can show the ROI, I can take it to the board next month.",
      ],
      ["rep", "Do you have a similar case study?"],
      ["client", "That is what I was going to ask you."],
    ],
  },
  {
    id: "call-solvex-walkthrough",
    dealId: "solvex",
    title: "Proposal walkthrough",
    daysAgo: 20,
    repId: "sam",
    client: { name: "Dana Whitfield", role: "COO" },
    outcome: "Moved to proposal.",
    transcript: [
      [
        "rep",
        "This is the scope we discussed. The fixed fee covers the connector and the migration.",
      ],
      ["client", "That looks right. Legal reviews every vendor agreement, so I will loop them in."],
    ],
  },
  {
    id: "call-ferro-first",
    dealId: "ferro",
    title: "First call",
    daysAgo: 12,
    repId: "sam",
    client: { name: "Marcus Lindqvist", role: "Head of Data" },
    outcome: "Security questionnaire requested.",
    transcript: [
      [
        "client",
        "Any new vendor goes through a security review. Send me the questionnaire and I will start it.",
      ],
      ["rep", "I will send it today."],
    ],
  },
  {
    id: "call-highline-pricing",
    dealId: "highline",
    title: "Pricing call",
    daysAgo: 1,
    repId: "jules",
    client: { name: "Rosa Delgado", role: "VP Supply Chain" },
    outcome: "Agreed the scope. Revised order form to follow.",
    transcript: [
      [
        "client",
        "The scope is right. Can you send a revised order form with the second site included?",
      ],
      ["rep", "Yes, I will send it today."],
    ],
  },
  {
    id: "call-highline-pricing-1",
    dealId: "highline",
    title: "First pricing call",
    daysAgo: 9,
    repId: "jules",
    client: { name: "Rosa Delgado", role: "VP Supply Chain" },
    outcome: "Asked for two options.",
    transcript: [
      ["client", "Show me the price with one site and with two sites."],
      ["rep", "I will put both options in the order form."],
    ],
  },
];

export function seedCalls(ctx: SeedContext): void {
  for (const call of COMPLETED) {
    db.call.create({
      id: call.id,
      dealId: call.dealId,
      title: call.title,
      startsAt: daysAgo(ctx, call.daysAgo),
      durationMin: 30,
      status: "completed",
      repId: call.repId,
      participantsJson: json([
        { name: call.client.name, role: call.client.role, side: "client" },
        { name: REP_NAMES[call.repId] ?? call.repId, role: "Account executive", side: "rep" },
      ]),
      outcome: call.outcome,
      scenarioId: null,
    });
    call.transcript.forEach(([speaker, text], i) => {
      db.segment.create({
        id: `${call.id}-s${i + 1}`,
        callId: call.id,
        speaker,
        name: speaker === "client" ? call.client.name : (REP_NAMES[call.repId] ?? call.repId),
        text,
        atSec: 20 + i * 45,
      });
    });
    db.summary.create({
      callId: call.id,
      status: "approved",
      keyPoints: [call.outcome],
      clientQuestions: [],
      commitmentsJson: json([]),
      nextAction: "",
      blocker: "",
    });
  }

  // The earlier call showed Sam one answer card, so the library has something to show.
  db.card.create({
    id: "card-intro-1",
    callId: "call-blue-harbor-intro",
    kind: "answer",
    text: "We connect to SAP and to carrier portals through ready-made connectors.",
    sourceJson: json({
      title: "Product overview",
      version: "v4",
      section: "section 3",
      passage: "Ready-made connectors cover SAP and the major carrier portals.",
    }),
    atSec: 140,
    verdict: "useful",
  });

  // Today's calls.
  db.call.create({
    id: "call-blue-harbor-live",
    dealId: "blue-harbor",
    title: "Integration and next steps",
    startsAt: today(ctx, 14),
    durationMin: 45,
    status: "upcoming",
    repId: "sam",
    participantsJson: json([
      { name: "Tom Reyes", role: "Director of Operations", side: "client" },
      { name: "Lena Hoff", role: "IT lead", side: "client" },
      { name: "Sam Okafor", role: "Account executive", side: "rep" },
    ]),
    scenarioId: "blue-harbor",
  });
  db.brief.create({
    callId: "call-blue-harbor-live",
    accountSummary:
      "Blue Harbor Logistics moves freight for retail customers through regional distribution sites. Tom Reyes owns operations. The carrier portal and SAP are not connected, and two people re-enter data by hand. Tom has seen another vendor.",
    openQuestions: [
      "How long does integration take with SAP?",
      "Does the product meet their security requirements?",
      "How does the price compare with the other vendor?",
    ],
    commitments: ["Send the integration timeline (promised on the intro call, now 9 days late)"],
    likelyObjections: [
      "Price is higher than the other vendor",
      "Integration will disrupt peak season",
    ],
    agenda: [
      "Confirm the sites and systems involved",
      "Walk through the integration plan",
      "Answer security questions",
      "Agree the next step and date",
    ],
  });

  db.call.create({
    id: "call-solvex-qa",
    dealId: "solvex",
    title: "Proposal questions",
    startsAt: today(ctx, 16, 30),
    durationMin: 30,
    status: "upcoming",
    repId: "sam",
    participantsJson: json([
      { name: "Dana Whitfield", role: "COO", side: "client" },
      { name: "Sam Okafor", role: "Account executive", side: "rep" },
    ]),
    scenarioId: null,
  });
  db.brief.create({
    callId: "call-solvex-qa",
    accountSummary:
      "Solvex Manufacturing received the proposal 8 days ago. Dana signs off alone, but legal reviews vendor terms.",
    openQuestions: ["Has legal received the proposal?", "Is there a decision date?"],
    commitments: [],
    likelyObjections: ["Contract terms need legal review"],
    agenda: [
      "Check where the proposal stands",
      "Offer to join a call with legal",
      "Agree a decision date",
    ],
  });

  db.call.create({
    id: "call-highline-check",
    dealId: "highline",
    title: "Order form review",
    startsAt: today(ctx, 15),
    durationMin: 30,
    status: "upcoming",
    repId: "jules",
    participantsJson: json([
      { name: "Rosa Delgado", role: "VP Supply Chain", side: "client" },
      { name: "Jules Park", role: "Account executive", side: "rep" },
    ]),
    scenarioId: null,
  });
  db.brief.create({
    callId: "call-highline-check",
    accountSummary:
      "Highline Freight agreed the scope. The revised order form includes the second site.",
    openQuestions: ["Who signs the order form?"],
    commitments: ["Send the revised order form"],
    likelyObjections: [],
    agenda: ["Review the order form", "Agree the signing date"],
  });
}
