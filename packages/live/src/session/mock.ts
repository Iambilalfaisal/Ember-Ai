import type { LiveEvent, LiveEventType } from "@ember/api";
import type {
  LiveSession,
  PlaybackSnapshot,
  PlaybackSpeed,
  ScenarioControls,
  Verdict,
} from "./types";

const TICK_MS = 50;

type Handler = (event: LiveEvent) => void;

/**
 * Plays a scenario: a timeline of events with millisecond offsets. Call time advances in small ticks,
 * scaled by the speed, so pausing and restarting are exact and tests can drive it with fake timers.
 */
export class MockLiveSession implements LiveSession, ScenarioControls {
  private readonly events: LiveEvent[];
  private handlers = new Map<LiveEventType, Set<Handler>>();
  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private elapsedMs = 0;
  private next = 0;
  private speed: PlaybackSpeed = 1;
  private ended = false;
  readonly feedback = new Map<string, Verdict>();

  constructor(events: LiveEvent[]) {
    this.events = [...events].sort((a, b) => a.at - b.at);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the interface passes the call id; a script has no use for it
  start(_callId?: string): Promise<void> {
    this.ended = false;
    this.deliverDue();
    this.play();
    return Promise.resolve();
  }

  on<T extends LiveEventType>(
    type: T,
    handler: (event: Extract<LiveEvent, { type: T }>) => void,
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(type, set);
    return () => set.delete(handler as Handler);
  }

  sendFeedback(cardId: string, verdict: Verdict): void {
    this.feedback.set(cardId, verdict);
  }

  end(): Promise<void> {
    this.ended = true;
    this.stopTimer();
    this.notify();
    return Promise.resolve();
  }

  play(): void {
    if (this.timer || this.ended || this.finished()) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.notify();
  }

  pause(): void {
    this.stopTimer();
    this.notify();
  }

  restart(): void {
    this.stopTimer();
    this.elapsedMs = 0;
    this.next = 0;
    this.feedback.clear();
    this.ended = false;
    this.listeners.forEach((listener) => listener(this.snapshot()));
    this.deliverDue();
    this.play();
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
    this.notify();
  }

  onPlayback(handler: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  snapshot(): PlaybackSnapshot {
    return {
      elapsedMs: this.elapsedMs,
      playing: this.timer !== undefined,
      finished: this.finished(),
      speed: this.speed,
    };
  }

  private finished(): boolean {
    return this.next >= this.events.length;
  }

  private tick(): void {
    this.elapsedMs += TICK_MS * this.speed;
    this.deliverDue();
    if (this.finished()) this.stopTimer();
    this.notify();
  }

  private deliverDue(): void {
    while (this.next < this.events.length) {
      const event = this.events[this.next];
      if (!event || event.at > this.elapsedMs) break;
      this.next += 1;
      this.handlers.get(event.type)?.forEach((handler) => handler(event));
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private notify(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
