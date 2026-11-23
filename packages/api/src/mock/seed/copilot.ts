import { db } from "../db";
import { json } from "../mappers";
import { daysAgo, daysAhead, type SeedContext } from "./people";

type SuggestionSeed = {
  id: string;
  dealId: string;
  userId: string;
  kind: "set_next_action" | "nudge_draft" | "revive" | "assign_owner";
  title: string;
  why: string;
  facts: string[];
  proposedAction: string;
  dueInDays: number | null;
  assigneeId?: string;
};

// What the copilot has noticed overnight, for each person. Approving one is the demo's key moment: it
// is the only way the copilot changes anything, and every approval lands in the audit log.
const SUGGESTIONS: SuggestionSeed[] = [
  {
    id: "sg-solvex",
    dealId: "solvex",
    userId: "sam",
    kind: "set_next_action",
    title: "Solvex has gone quiet after the proposal",
    why: "The proposal went out 8 days ago and nobody has replied. The follow-up rule for proposals is 7 days.",
    facts: [
      "Proposal sent 8 days ago",
      "Rule: 7 days in Proposal",
      "Last real contact: a call, 8 days ago",
    ],
    proposedAction: "Call Solvex's legal lead about the order form",
    dueInDays: 1,
  },
  {
    id: "sg-ferro",
    dealId: "ferro",
    userId: "sam",
    kind: "nudge_draft",
    title: "Ferro is waiting on the security answers",
    why: "Ferro asked about the security questionnaire 4 days ago and the answer has not gone out.",
    facts: [
      "Asked about SOC 2 on the last call",
      "Questionnaire still open",
      "Contact is a decision maker",
    ],
    proposedAction: "Draft a reply with the security summary",
    dueInDays: 0,
  },
  {
    id: "sg-tarnhelm",
    dealId: "tarnhelm",
    userId: "sam",
    kind: "revive",
    title: "Tarnhelm may be ready to talk again",
    why: "Their budget freeze ended with the new financial year, and their original need still stands.",
    facts: [
      "Lost reason: budget",
      "Original need: connect parcel tracking to their warehouse system",
      "Contact has not opted out",
    ],
    proposedAction: "Ask if the freeze has lifted and offer a short call",
    dueInDays: 2,
  },
  {
    id: "sg-ridgeline",
    dealId: "ridgeline",
    userId: "jules",
    kind: "revive",
    title: "Ridgeline's timing may have changed",
    why: "It has been 96 days since they paused. Their season ends this month.",
    facts: ["Lost reason: bad timing", "Last stage: Qualified", "Contact has not opted out"],
    proposedAction: "Send a short check-in about their new season",
    dueInDays: 2,
  },
  {
    id: "sg-nimbus",
    dealId: "nimbus",
    userId: "priya",
    kind: "assign_owner",
    title: "Nimbus Freight has had no owner for 3 days",
    why: "A request came in and nobody has replied. Jules has the lightest queue today.",
    facts: ["Wrote in 3 days ago", "No owner, no next action", "Jules has 1 open item"],
    proposedAction: "Assign to Jules Park and draft a first reply",
    dueInDays: null,
    assigneeId: "jules",
  },
];

export function seedCopilot(ctx: SeedContext): void {
  for (const s of SUGGESTIONS) {
    db.suggestion.create({
      id: s.id,
      dealId: s.dealId,
      userId: s.userId,
      kind: s.kind,
      title: s.title,
      why: s.why,
      factsJson: json(s.facts),
      proposedAction: s.proposedAction,
      proposedDueAt: s.dueInDays === null ? null : daysAhead(ctx, s.dueInDays),
      assigneeId: s.assigneeId ?? null,
      state: "pending",
    });
  }

  // Yesterday's approvals, so the activity page has a history before the demo starts.
  const history: [number, string, string, string, string, "copilot" | "manual"][] = [
    [
      1,
      "sam",
      "highline",
      "draft_sent",
      'Sent "Revised order form" (written by Ember from 3 facts)',
      "copilot",
    ],
    [
      1,
      "jules",
      "highline",
      "next_action_set",
      "Next action: Send the revised order form",
      "copilot",
    ],
    [
      2,
      "sam",
      "blue-harbor",
      "tasks_created",
      "Approved the call summary: 3 tasks created",
      "copilot",
    ],
    [
      3,
      "priya",
      "nimbus",
      "stage_changed",
      "Moved from Discovery to Discovery (kept, owner pending)",
      "manual",
    ],
  ];
  history.forEach(([days, userId, dealId, action, summary, via], i) => {
    const deal = db.deal.findFirst({ where: { id: { equals: dealId } } });
    db.audit.create({
      id: `au-seed-${i}`,
      at: daysAgo(ctx, days),
      userId,
      dealId,
      company: deal?.company ?? dealId,
      action,
      summary,
      via,
    });
  });
}
