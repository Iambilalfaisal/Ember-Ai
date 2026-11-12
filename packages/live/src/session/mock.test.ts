import type { LiveEvent } from "@ember/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLiveSession } from "./mock";

const events: LiveEvent[] = [
  { at: 0, type: "session.ready" },
  { at: 1000, type: "suggestion.next_question", question: "First?" },
  { at: 3000, type: "suggestion.next_question", question: "Second?" },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function collect(session: MockLiveSession) {
  const seen: string[] = [];
  session.on("session.ready", () => seen.push("ready"));
  session.on("suggestion.next_question", (e) => seen.push(e.question));
  return seen;
}

describe("MockLiveSession", () => {
  it("plays events at their offsets and reports when it is finished", async () => {
    const session = new MockLiveSession(events);
    const seen = collect(session);
    await session.start("call");

    vi.advanceTimersByTime(500);
    expect(seen).toEqual(["ready"]);
    vi.advanceTimersByTime(600);
    expect(seen).toEqual(["ready", "First?"]);
    expect(session.snapshot().finished).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(["ready", "First?", "Second?"]);
    expect(session.snapshot()).toMatchObject({ finished: true, playing: false });
  });

  it("pauses and resumes without losing its place", async () => {
    const session = new MockLiveSession(events);
    const seen = collect(session);
    await session.start("call");
    vi.advanceTimersByTime(800);
    session.pause();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["ready"]);
    session.play();
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(["ready", "First?"]);
  });

  it("plays twice as fast at 2x", async () => {
    const session = new MockLiveSession(events);
    const seen = collect(session);
    session.setSpeed(2);
    await session.start("call");
    vi.advanceTimersByTime(1600);
    expect(seen).toContain("Second?");
    expect(session.snapshot().elapsedMs).toBeGreaterThanOrEqual(3000);
  });

  it("starts again from the top on restart", async () => {
    const session = new MockLiveSession(events);
    const seen = collect(session);
    await session.start("call");
    vi.advanceTimersByTime(4000);
    session.restart();
    expect(session.snapshot().elapsedMs).toBe(0);
    vi.advanceTimersByTime(1100);
    expect(seen.filter((s) => s === "First?")).toHaveLength(2);
  });

  it("stops for good when the call ends, and remembers feedback", async () => {
    const session = new MockLiveSession(events);
    const seen = collect(session);
    await session.start("call");
    session.sendFeedback("c1", "useful");
    await session.end();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual(["ready"]);
    expect(session.feedback.get("c1")).toBe("useful");
  });

  it("stops delivering to a handler that unsubscribed", async () => {
    const session = new MockLiveSession(events);
    const seen: string[] = [];
    const off = session.on("suggestion.next_question", (e) => seen.push(e.question));
    await session.start("call");
    vi.advanceTimersByTime(1100);
    off();
    vi.advanceTimersByTime(3000);
    expect(seen).toEqual(["First?"]);
  });
});
