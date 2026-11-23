import type { TourPath } from "@/lib/ui";

export type { TourPath };

export type Step = {
  /** The headline: what this part of the product does for the customer. */
  title: string;
  /** Why it matters, for the person watching. */
  value: string;
  /** What to do on this screen, in one or two sentences. */
  action: string;
  /** A line for the presenter to say out loud. Shown under "Presenter notes". */
  say: string;
  userId: "sam" | "jules" | "priya" | "alex";
  href: string;
  /** The part of the screen to light up: the value of a data-tour attribute. */
  target: string;
  /** Which bottom corner the card sits in, so it stays off the lit area. */
  dock: "left" | "right";
};

export const PATH_LABEL: Record<TourPath, string> = {
  investor: "The full product story",
  morning: "Copilot: morning to follow-up",
  rescue: "Copilot: stalled-deal rescue",
};

// Path 1. One rep's morning: the digest, an approval, the day's list, the call and what it leaves behind.
export const MORNING_STEPS: readonly Step[] = [
  {
    title: "Start the day with the digest",
    value:
      "Ember reads the whole CRM overnight and tells Sam what matters before he opens anything else.",
    action: "Read the digest: how many deals need him, how many next actions are late or missing.",
    say: "Nobody has to hunt through a pipeline. The first screen is already a plan for the day.",
    userId: "sam",
    href: "/copilot",
    target: "copilot-digest",
    dock: "right",
  },
  {
    title: "Ember suggests, you approve",
    value:
      "Each suggestion shows why it exists, the facts behind it and exactly what approving will do.",
    action:
      "On the Solvex card press Approve. The next action and its task are set, and nothing else changes.",
    say: "The copilot never writes to a deal on its own. A person says yes, every time.",
    userId: "sam",
    href: "/copilot",
    target: "copilot-suggestions",
    dock: "left",
  },
  {
    title: "Every approval leaves a trail",
    value: "The activity log records what changed, who approved it and whether Ember suggested it.",
    action: "Find the Solvex entry: suggested by Ember, approved by Sam, with the time.",
    say: "This is what makes it safe to trust. You can always see what the copilot did and who allowed it.",
    userId: "sam",
    href: "/copilot",
    target: "copilot-activity",
    dock: "left",
  },
  {
    title: "A day with reasons, not a list",
    value:
      "Each row says why it is there, when there was last real contact and how long the deal has sat in its stage.",
    action: "Read the rows: the reason, the last call or email, and any deal with no next action.",
    say: "A note or an edit does not count as contact. Only calls, meetings and real emails do.",
    userId: "sam",
    href: "/my-day",
    target: "my-day-list",
    dock: "right",
  },
  {
    title: "Prepared, and who decides is clear",
    value:
      "The brief shows where things stand and who is on the call, with the part each person plays in the decision.",
    action: "Look at Who is on the call: Nadia, the CFO, is marked Decision maker.",
    say: "Sam walks in knowing the CFO is on the line and what she will care about.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/prep",
    target: "brief",
    dock: "right",
  },
  {
    title: "Answers on the call, with proof",
    value:
      "Ember answers from the company's own documents, with the source, and says so when it does not know.",
    action:
      "Watch the cards arrive: an answer with its source, Not confirmed, and a price objection.",
    say: "No guessing and no “I'll get back to you”. Every answer carries a source.",
    userId: "sam",
    href: "/live/call-blue-harbor-live",
    target: "live-panel",
    dock: "left",
  },
  {
    title: "The call writes its own follow-up",
    value: "Tasks, a next action and a follow-up draft are prepared the moment the call ends.",
    action: "End the call, then approve the summary. Tasks appear and the draft is ready.",
    say: "The rep reviews instead of typing. An hour of admin becomes a minute.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/review",
    target: "review",
    dock: "right",
  },
  {
    title: "And the trail shows it all",
    value: "The approval, the tasks and the draft are all in the log, in the order they happened.",
    action: "Open the log: the call summary approval and tasks are there under Sam's name.",
    say: "Ten minutes after the call, the CRM is current and fully accounted for.",
    userId: "sam",
    href: "/copilot/activity",
    target: "copilot-audit",
    dock: "right",
  },
];

// Path 2. A deal nobody owns: the lead sees it, approves the fix, the rep picks it up and the deal comes back.
export const RESCUE_STEPS: readonly Step[] = [
  {
    title: "The manager sees what is slipping",
    value: "Stalled and unassigned deals are flagged with the reason, before the forecast meeting.",
    action: "Find Nimbus Freight: no owner, no reply for three days.",
    say: "This used to be found a week late. Now it is the first thing the lead sees.",
    userId: "priya",
    href: "/team",
    target: "team-table",
    dock: "right",
  },
  {
    title: "One approval fixes it",
    value: "Ember proposes who should take it and why, and does the setup once the lead agrees.",
    action: "Approve “Assign to Jules Park and draft a first reply”.",
    say: "Assigning, the first reply and the log entry happen in one step.",
    userId: "priya",
    href: "/copilot",
    target: "copilot-suggestions",
    dock: "left",
  },
  {
    title: "It lands in Jules' day, reply ready",
    value: "The deal appears in Jules' list with the reason and a drafted first reply.",
    action: "Open Nimbus Freight, read the draft and send it.",
    say: "From unowned to answered in a couple of minutes, with nothing dropped.",
    userId: "jules",
    href: "/my-day",
    target: "my-day-list",
    dock: "right",
  },
  {
    title: "A quiet deal is brought back",
    value:
      "Older deals are revived when their reason to stall has passed, and never for anyone who opted out.",
    action: "Approve “Ridgeline's timing may have changed”. A draft and a task are prepared.",
    say: "Revival is not a cold list. Ember says why now is a good time, and skips anyone who opted out.",
    userId: "jules",
    href: "/copilot",
    target: "copilot-suggestions",
    dock: "left",
  },
  {
    title: "Calls outside Teams count too",
    value:
      "A WhatsApp or phone call is logged in seconds, its promises become tasks and the deal counts as contacted.",
    action: "Press Log a call, write what was said and one promise, then save.",
    say: "Real selling happens on the phone. Ember learns from it as much as from a recorded call.",
    userId: "jules",
    href: "/deals/ridgeline",
    target: "deal-header",
    dock: "right",
  },
  {
    title: "The whole story is on the record",
    value: "Both people's decisions are in the log, with who made each one.",
    action: "Read the log: Priya assigned, Jules sent and revived, and the call he logged.",
    say: "A manager, an auditor or a customer asking “who changed this?” gets one clear answer.",
    userId: "jules",
    href: "/copilot/activity",
    target: "copilot-audit",
    dock: "right",
  },
];
