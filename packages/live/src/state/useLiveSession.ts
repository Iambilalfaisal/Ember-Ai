"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { liveReducer, initialLiveState, type LiveState } from "./reducer";
import type { LiveSession, PlaybackSnapshot, ScenarioControls, Verdict } from "../session/types";
import type { LiveEventType } from "@ember/api";

const EVENT_TYPES: LiveEventType[] = [
  "session.ready",
  "transcript.partial",
  "transcript.final",
  "card.start",
  "card.delta",
  "card.end",
  "card.not_confirmed",
  "suggestion.next_question",
  "card.objection",
  "alert.contradiction",
];

const idle: PlaybackSnapshot = { elapsedMs: 0, playing: false, finished: false, speed: 1 };

/** Wires a session to the panel's state. Restarting the session clears what was on screen. */
export function useLiveSession(session: (LiveSession & Partial<ScenarioControls>) | null) {
  const [state, dispatch] = useReducer(liveReducer, initialLiveState);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(idle);

  useEffect(() => {
    if (!session) return;
    const unsubscribers = EVENT_TYPES.map((type) => session.on(type, (event) => dispatch(event)));
    let lastElapsed = 0;
    const stopPlayback = session.onPlayback?.((snapshot) => {
      // Time going backwards means the scenario restarted.
      if (snapshot.elapsedMs < lastElapsed) dispatch({ type: "reset" });
      lastElapsed = snapshot.elapsedMs;
      setPlayback(snapshot);
    });
    return () => {
      unsubscribers.forEach((off) => off());
      stopPlayback?.();
    };
  }, [session]);

  const feedback = useCallback(
    (cardId: string, verdict: Verdict) => {
      dispatch({ type: "feedback", cardId, verdict });
      session?.sendFeedback(cardId, verdict);
    },
    [session],
  );
  const markAsked = useCallback((cardId: string) => dispatch({ type: "asked", cardId }), []);

  return { state: state satisfies LiveState, playback, feedback, markAsked };
}
