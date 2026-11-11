import { addDays } from "date-fns";

export type SummaryContent = {
  keyPoints: string[];
  clientQuestions: string[];
  commitments: { text: string; dueAt: string }[];
  nextAction: string;
  blocker: string;
};

/** The draft summary a call produces when it ends. The Blue Harbor one matches the scripted live call. */
export function draftSummaryFor(
  call: { scenarioId: string | null; title: string },
  openQuestions: string[],
  now: Date,
): SummaryContent {
  if (call.scenarioId === "blue-harbor") {
    return {
      keyPoints: [
        "Integration runs in three phases over six to eight weeks, with the ERP connector first.",
        "Blue Harbor now has six sites in scope. The intro call said four.",
        "The price is higher than the other vendor they looked at. Sam will compare the scope.",
      ],
      clientQuestions: [
        "How long does integration take with SAP?",
        "Do you have a security certification?",
        "Why is the price higher than the other vendor?",
      ],
      commitments: [
        { text: "Send the integration plan in writing", dueAt: addDays(now, 2).toISOString() },
        {
          text: "Confirm the security certification and reply to Tom",
          dueAt: addDays(now, 3).toISOString(),
        },
      ],
      nextAction: "Send the integration plan and the security answer in writing",
      blocker: "The security certification isn't confirmed in the documents",
    };
  }
  return {
    keyPoints: [`Discussed: ${call.title.toLowerCase()}.`],
    clientQuestions: openQuestions.slice(0, 2),
    commitments: [{ text: "Send a written follow-up", dueAt: addDays(now, 1).toISOString() }],
    nextAction: "Send a written follow-up",
    blocker: "",
  };
}
