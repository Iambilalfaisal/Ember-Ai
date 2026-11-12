import type { LiveEvent, SourceRef } from "@ember/api";
import type { Verdict } from "../session/types";

export type TranscriptEntry = {
  id: string;
  speaker: "client" | "rep";
  name: string;
  text: string;
  /** True while the line is still being spoken. */
  partial: boolean;
  atMs: number;
};

export type LiveCardKind =
  "answer" | "not_confirmed" | "objection" | "contradiction" | "next_question";

export type LiveCard = {
  id: string;
  kind: LiveCardKind;
  /** Answer text (streams in), the holding line, the suggested response, or the question. */
  text: string;
  source: SourceRef | null;
  /** Objection heard, or what was said earlier and now for a contradiction. */
  objection?: string;
  earlier?: string;
  now?: string;
  streaming: boolean;
  verdict: Verdict | null;
  asked: boolean;
  atMs: number;
};

export type LiveState = {
  ready: boolean;
  transcript: TranscriptEntry[];
  cards: LiveCard[];
};

export const initialLiveState: LiveState = { ready: false, transcript: [], cards: [] };

export type LiveAction =
  | LiveEvent
  | { type: "feedback"; cardId: string; verdict: Verdict }
  | { type: "asked"; cardId: string }
  | { type: "reset" };

function patchCard(state: LiveState, id: string, patch: (card: LiveCard) => LiveCard): LiveState {
  return { ...state, cards: state.cards.map((card) => (card.id === id ? patch(card) : card)) };
}

const blank = { source: null, streaming: false, verdict: null, asked: false } as const;

/** Pure: the same events always give the same state. Everything the panel shows comes from here. */
export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case "reset":
      return initialLiveState;
    case "session.ready":
      return { ...state, ready: true };
    case "transcript.partial":
    case "transcript.final": {
      const entry: TranscriptEntry = {
        id: action.segmentId,
        speaker: action.speaker,
        name: action.name,
        text: action.text,
        partial: action.type === "transcript.partial",
        atMs: action.at,
      };
      const exists = state.transcript.some((line) => line.id === entry.id);
      return {
        ...state,
        transcript: exists
          ? state.transcript.map((line) => (line.id === entry.id ? entry : line))
          : [...state.transcript, entry],
      };
    }
    case "card.start":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            ...blank,
            id: action.cardId,
            kind: "answer",
            text: "",
            source: action.source,
            streaming: true,
            atMs: action.at,
          },
        ],
      };
    case "card.delta":
      return patchCard(state, action.cardId, (card) => ({
        ...card,
        text: card.text + action.text,
      }));
    case "card.end":
      return patchCard(state, action.cardId, (card) => ({ ...card, streaming: false }));
    case "card.not_confirmed":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            ...blank,
            id: action.cardId,
            kind: "not_confirmed",
            text: action.holdingLine,
            atMs: action.at,
          },
        ],
      };
    case "card.objection":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            ...blank,
            id: action.cardId,
            kind: "objection",
            text: action.response,
            objection: action.objection,
            source: action.source,
            atMs: action.at,
          },
        ],
      };
    case "alert.contradiction":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            ...blank,
            id: `contradiction-${action.at}`,
            kind: "contradiction",
            text: `${action.earlier} ${action.now}`,
            earlier: action.earlier,
            now: action.now,
            atMs: action.at,
          },
        ],
      };
    case "suggestion.next_question":
      return {
        ...state,
        cards: [
          ...state.cards,
          {
            ...blank,
            id: `next-${action.at}`,
            kind: "next_question",
            text: action.question,
            atMs: action.at,
          },
        ],
      };
    case "feedback":
      return patchCard(state, action.cardId, (card) => ({ ...card, verdict: action.verdict }));
    case "asked":
      return patchCard(state, action.cardId, (card) => ({ ...card, asked: true }));
  }
}

/** The cards that get the hero and history treatment. Next questions have their own place. */
export const isMainCard = (card: LiveCard) => card.kind !== "next_question";
