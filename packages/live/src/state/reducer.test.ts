import type { LiveEvent } from "@ember/api";
import { describe, expect, it } from "vitest";
import { initialLiveState, liveReducer, type LiveAction } from "./reducer";

const play = (events: LiveAction[]) => events.reduce(liveReducer, initialLiveState);

const source = { title: "Integration guide", version: "v3", section: "section 2", passage: "p" };

describe("liveReducer", () => {
  it("replaces a partial line with the next one and settles it on final", () => {
    const base = { speaker: "client", name: "Tom", segmentId: "s1" } as const;
    const events: LiveEvent[] = [
      { at: 0, type: "transcript.partial", ...base, text: "How long" },
      { at: 100, type: "transcript.partial", ...base, text: "How long does it take" },
    ];
    const mid = play(events);
    expect(mid.transcript).toHaveLength(1);
    expect(mid.transcript[0]).toMatchObject({ text: "How long does it take", partial: true });

    const done = liveReducer(mid, {
      at: 200,
      type: "transcript.final",
      ...base,
      text: "How long does it take?",
    });
    expect(done.transcript[0]).toMatchObject({ text: "How long does it take?", partial: false });
  });

  it("builds an answer card token by token, then stops streaming", () => {
    const state = play([
      { at: 0, type: "card.start", cardId: "c1", source },
      { at: 1, type: "card.delta", cardId: "c1", text: "Three" },
      { at: 2, type: "card.delta", cardId: "c1", text: " phases" },
    ]);
    expect(state.cards[0]).toMatchObject({ text: "Three phases", streaming: true, source });
    const ended = liveReducer(state, { at: 3, type: "card.end", cardId: "c1" });
    expect(ended.cards[0]?.streaming).toBe(false);
  });

  it("keeps each kind of card in the order it arrived", () => {
    const state = play([
      { at: 1, type: "card.not_confirmed", cardId: "c2", holdingLine: "I will confirm that." },
      {
        at: 2,
        type: "card.objection",
        cardId: "c3",
        objection: "Too dear",
        response: "Compare scope",
        source: null,
      },
      { at: 3, type: "alert.contradiction", earlier: "Four sites.", now: "Six sites." },
      { at: 4, type: "suggestion.next_question", question: "Which ERP?" },
    ]);
    expect(state.cards.map((c) => c.kind)).toEqual([
      "not_confirmed",
      "objection",
      "contradiction",
      "next_question",
    ]);
    expect(state.cards[1]).toMatchObject({ objection: "Too dear", text: "Compare scope" });
    expect(state.cards[2]).toMatchObject({ earlier: "Four sites.", now: "Six sites." });
  });

  it("records feedback and 'asked' on the card, and resets", () => {
    let state = play([{ at: 1, type: "card.not_confirmed", cardId: "c2", holdingLine: "x" }]);
    state = liveReducer(state, { type: "feedback", cardId: "c2", verdict: "wrong" });
    state = liveReducer(state, { type: "asked", cardId: "c2" });
    expect(state.cards[0]).toMatchObject({ verdict: "wrong", asked: true });
    expect(liveReducer(state, { type: "reset" })).toEqual(initialLiveState);
  });
});
