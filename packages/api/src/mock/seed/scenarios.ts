import type { LiveEvent, SourceRef } from "../../domain";

// The scripted Blue Harbor call. A short script of beats is expanded into the fine-grained event
// timeline the live panel plays: transcript partials arrive word by word, card text token by token.

type Beat =
  | { t: number; say: "client" | "rep"; text: string }
  | { t: number; answer: string; cardId: string; source: SourceRef }
  | { t: number; notConfirmed: string; cardId: string }
  | {
      t: number;
      objection: string;
      response: string;
      cardId: string;
      source: SourceRef;
    }
  | { t: number; contradiction: { earlier: string; now: string } }
  | { t: number; nextQuestion: string };

const CLIENT = "Tom Reyes";
const REP = "Sam Okafor";
const WORD_MS = 150;
const TOKEN_MS = 110;

const integrationGuide: SourceRef = {
  title: "Integration guide",
  version: "v3",
  section: "section 2",
  passage:
    "Integration runs in three phases over six to eight weeks. The ERP connector is built first, then carrier portals, then reporting.",
};

const pricingGuide: SourceRef = {
  title: "Pricing guide",
  version: "v4",
  section: "section 1",
  passage:
    "The price includes the ERP connector, onboarding for every site and a named support lead. Quotes that leave these out are not like for like.",
};

const blueHarbor: Beat[] = [
  {
    t: 1500,
    say: "client",
    text: "Thanks for joining. Before we go further, how long does integration take with SAP?",
  },
  {
    t: 4600,
    answer:
      "Integration runs in three phases over six to eight weeks, with the ERP connector first.",
    cardId: "card-integration",
    source: integrationGuide,
  },
  {
    t: 8200,
    say: "rep",
    text: "Good question. Three phases over six to eight weeks, and we start with the ERP connector.",
  },
  {
    t: 11800,
    say: "client",
    text: "And do you have a security certification? Lena, our IT lead, will ask.",
  },
  {
    t: 14400,
    notConfirmed:
      "I want to give you an accurate answer on that, so I will confirm it in writing today.",
    cardId: "card-security",
  },
  { t: 17000, say: "rep", text: "I will confirm that in writing today." },
  {
    t: 19600,
    say: "client",
    text: "Honestly, your price is higher than the other vendor we looked at.",
  },
  {
    t: 22000,
    objection: "Your price is higher than the other vendor.",
    response:
      "Compare what each quote includes: ours covers the ERP connector, onboarding for every site and a named support lead.",
    cardId: "card-price",
    source: pricingGuide,
  },
  { t: 25600, say: "rep", text: "Fair. Let's compare what each quote includes." },
  {
    t: 28200,
    say: "client",
    text: "We also have six sites in scope now, not four.",
  },
  {
    t: 30800,
    contradiction: {
      earlier: "Four sites in scope, said on the intro call.",
      now: "Six sites in scope.",
    },
  },
  { t: 33200, nextQuestion: "Which ERP version are you on today?" },
  { t: 35400, say: "rep", text: "That helps. Thank you, Tom." },
];

const words = (text: string) => text.split(" ");

function expand(beats: Beat[]): LiveEvent[] {
  const events: LiveEvent[] = [{ at: 0, type: "session.ready" }];
  let segment = 0;
  for (const beat of beats) {
    if ("say" in beat) {
      segment += 1;
      const segmentId = `seg-${segment}`;
      const name = beat.say === "client" ? CLIENT : REP;
      const parts = words(beat.text);
      parts.forEach((_, index) => {
        events.push({
          at: beat.t + index * WORD_MS,
          type: "transcript.partial",
          speaker: beat.say,
          name,
          segmentId,
          text: parts.slice(0, index + 1).join(" "),
        });
      });
      events.push({
        at: beat.t + parts.length * WORD_MS,
        type: "transcript.final",
        speaker: beat.say,
        name,
        segmentId,
        text: beat.text,
      });
    } else if ("answer" in beat) {
      events.push({ at: beat.t, type: "card.start", cardId: beat.cardId, source: beat.source });
      const parts = words(beat.answer);
      parts.forEach((part, index) => {
        events.push({
          at: beat.t + (index + 1) * TOKEN_MS,
          type: "card.delta",
          cardId: beat.cardId,
          text: index === 0 ? part : ` ${part}`,
        });
      });
      events.push({
        at: beat.t + (parts.length + 1) * TOKEN_MS,
        type: "card.end",
        cardId: beat.cardId,
      });
    } else if ("notConfirmed" in beat) {
      events.push({
        at: beat.t,
        type: "card.not_confirmed",
        cardId: beat.cardId,
        holdingLine: beat.notConfirmed,
      });
    } else if ("objection" in beat) {
      events.push({
        at: beat.t,
        type: "card.objection",
        cardId: beat.cardId,
        objection: beat.objection,
        response: beat.response,
        source: beat.source,
      });
    } else if ("contradiction" in beat) {
      events.push({ at: beat.t, type: "alert.contradiction", ...beat.contradiction });
    } else {
      events.push({ at: beat.t, type: "suggestion.next_question", question: beat.nextQuestion });
    }
  }
  // Stable sort keeps same-millisecond events in script order.
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at - b.event.at || a.index - b.index)
    .map(({ event }) => event);
}

const scenarios: Record<string, LiveEvent[]> = { "blue-harbor": expand(blueHarbor) };

export function scenarioFor(id: string | null): LiveEvent[] | null {
  return id ? (scenarios[id] ?? null) : null;
}
