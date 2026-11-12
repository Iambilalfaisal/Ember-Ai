import type { LiveEvent, LiveEventType } from "@ember/api";

export type Verdict = "useful" | "wrong";

/** What the panel needs from a call session. A real one wraps the realtime socket; the demo plays a script. */
export interface LiveSession {
  start(callId: string): Promise<void>;
  on<T extends LiveEventType>(
    type: T,
    handler: (event: Extract<LiveEvent, { type: T }>) => void,
  ): () => void;
  sendFeedback(cardId: string, verdict: Verdict): void;
  end(): Promise<void>;
}

export type PlaybackSpeed = 1 | 2;

export type PlaybackSnapshot = {
  /** Time on the call, in milliseconds of call time (not wall-clock time). */
  elapsedMs: number;
  playing: boolean;
  finished: boolean;
  speed: PlaybackSpeed;
};

/** The extra controls only the demo session has. */
export interface ScenarioControls {
  play(): void;
  pause(): void;
  restart(): void;
  setSpeed(speed: PlaybackSpeed): void;
  onPlayback(handler: (snapshot: PlaybackSnapshot) => void): () => void;
  snapshot(): PlaybackSnapshot;
}
