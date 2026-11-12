import { describe, expect, it } from "vitest";
import { api, ApiError, configureApi } from "../client";
import { resetMockDb, setNow } from "./index";
import { db } from "./db";

const as = (id: string) => configureApi({ getUserId: () => id });

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the request to fail");
}

describe("the demo world", () => {
  it("tells one story: every opportunity in My Day also shows as needing attention in Team view", async () => {
    const myDay = await api.myDay.get();
    as("priya");
    const team = await api.team.get();

    expect(myDay.items.map((i) => i.deal.company)).toEqual([
      "Blue Harbor Logistics",
      "Meridian Robotics",
      "Solvex Manufacturing",
      "Ferro Analytics",
    ]);
    for (const item of myDay.items) {
      const row = team.rows.find((r) => r.deal.id === item.deal.id);
      expect(row?.deal.status, item.deal.company).toBe("needs_attention");
      expect(row?.reason).toBe(item.reason);
    }
    expect(team.rows.find((r) => r.deal.id === "nimbus")?.deal.status).toBe("unassigned");
    expect(team.rows.find((r) => r.deal.id === "highline")?.deal.status).toBe("on_track");
  });

  it("has two calls today for Sam, with the Blue Harbor call first", async () => {
    const myDay = await api.myDay.get();
    expect(myDay.counts).toEqual({ needYou: 4, callsToday: 2 });
    expect(myDay.calls.map((c) => c.company)).toEqual([
      "Blue Harbor Logistics",
      "Solvex Manufacturing",
    ]);
    expect(myDay.calls[0]?.scenarioId).toBe("blue-harbor");
  });

  it("has the revival candidates and leaves out the one who declined", async () => {
    as("priya");
    const revival = await api.team.revival();
    expect(revival.items.map((i) => i.deal.company).sort()).toEqual([
      "Coastal Parcel Systems",
      "Ridgeline Foods",
      "Tarnhelm Industrial",
    ]);
    expect(revival.excludedCount).toBe(1);
  });

  it("shows a rep only their own revival candidates", async () => {
    const revival = await api.team.revival();
    expect(revival.items.map((i) => i.deal.company)).toEqual(["Tarnhelm Industrial"]);
  });

  it("has 11 documents and exactly one inactive", async () => {
    const docs = await api.knowledge.documents();
    expect(docs).toHaveLength(11);
    expect(docs.filter((d) => d.status === "inactive")).toHaveLength(1);
  });

  it("has six weeks of reports", async () => {
    as("priya");
    const report = await api.reports.pilot();
    expect(report.weeks).toHaveLength(6);
    expect(report.weeks.at(-1)!.answersUsed).toBeGreaterThan(report.weeks[0]!.answersUsed);
  });

  it("is identical every time it is seeded", () => {
    const at = new Date("2026-11-10T09:00:00Z");
    setNow(at);
    resetMockDb();
    const snapshot = () =>
      JSON.stringify([
        db.deal.getAll(),
        db.contact.getAll(),
        db.weekly.getAll(),
        db.overdue.getAll(),
      ]);
    const first = snapshot();
    resetMockDb();
    expect(snapshot()).toBe(first);
    setNow(null);
  });
});

describe("who can do what", () => {
  it("keeps Team view for leads and admins", async () => {
    expect((await failure(api.team.get())).status).toBe(403);
    as("priya");
    await expect(api.team.get()).resolves.toBeDefined();
  });

  it("lets only an admin change the knowledge base", async () => {
    as("priya");
    expect((await failure(api.knowledge.deactivate("doc-pricing-v4"))).status).toBe(403);
    as("alex");
    await expect(api.knowledge.deactivate("doc-pricing-v4")).resolves.toMatchObject({
      status: "inactive",
    });
  });

  it("lets a rep see only their own opportunities", async () => {
    const mine = await api.deals.list();
    expect(mine.every((d) => d.ownerId === "sam")).toBe(true);
    expect((await failure(api.deals.get("highline"))).status).toBe(403);
    as("priya");
    expect((await api.deals.list()).length).toBeGreaterThan(mine.length);
  });

  it("rejects an unknown user and a bad request", async () => {
    as("nobody");
    expect((await failure(api.session.me())).status).toBe(401);
    as("sam");
    expect((await failure(api.myDay.snooze("md-meridian", 0))).code).toBe("invalid_request");
  });

  it("returns a plain error for something that does not exist", async () => {
    const error = await failure(api.deals.get("missing"));
    expect(error.status).toBe(404);
    expect(error.message).toBe("The opportunity wasn't found.");
  });
});

describe("My Day", () => {
  it("drops an item when it is handled, and the count and Team view follow", async () => {
    await api.myDay.handle("md-meridian");
    const after = await api.myDay.get();
    expect(after.counts.needYou).toBe(3);
    expect(after.items.map((i) => i.deal.id)).not.toContain("meridian");
    as("priya");
    const row = (await api.team.get()).rows.find((r) => r.deal.id === "meridian");
    expect(row?.deal.status).toBe("on_track");
    expect(row?.deal.heat).toBe("warm");
  });

  it("hides a snoozed item until its date", async () => {
    await api.myDay.snooze("md-ferro", 3);
    expect((await api.myDay.get()).items.map((i) => i.deal.id)).not.toContain("ferro");
  });
});

describe("drafts", () => {
  it("regenerates a different version", async () => {
    const [first] = await api.deals.drafts("meridian");
    const next = await api.drafts.regenerate(first!.id);
    expect(next.version).toBe(2);
    expect(next.body).not.toBe(first!.body);
    expect(next.factsUsed[0]).toBe(first!.factsUsed[0]);
  });

  it("keeps an edit", async () => {
    const [draft] = await api.deals.drafts("meridian");
    const edited = await api.drafts.update(draft!.id, { body: "Hi Priya, short one." });
    expect((await api.deals.drafts("meridian"))[0]?.body).toBe(edited.body);
  });

  it("sends once: the item leaves My Day and the timeline shows the email", async () => {
    const [draft] = await api.deals.drafts("meridian");
    const sent = await api.drafts.send(draft!.id);
    expect(sent.status).toBe("sent");
    expect((await api.myDay.get()).items.map((i) => i.deal.id)).not.toContain("meridian");
    const detail = await api.deals.get("meridian");
    expect(detail.interactions[0]).toMatchObject({ type: "email" });
    expect((await failure(api.drafts.send(draft!.id))).code).toBe("already_sent");
    expect((await failure(api.drafts.update(draft!.id, { body: "late edit" }))).code).toBe(
      "already_sent",
    );
  });
});

describe("the Blue Harbor call", () => {
  it("has a brief before the call", async () => {
    const brief = await api.calls.brief("call-blue-harbor-live");
    expect(brief.openQuestions).toContain("How long does integration take with SAP?");
  });

  it("ending the call moves it to the library with a draft summary", async () => {
    const summary = await api.calls.end("call-blue-harbor-live", {
      transcript: [
        {
          id: "s1",
          speaker: "client",
          name: "Tom Reyes",
          text: "We have six sites now.",
          atSec: 30,
        },
      ],
    });
    expect(summary.status).toBe("draft");
    const detail = await api.calls.get("call-blue-harbor-live");
    expect(detail.call.status).toBe("completed");
    expect(detail.transcript).toHaveLength(1);
    expect((await failure(api.calls.end("call-blue-harbor-live"))).code).toBe("already_ended");
  });

  it("approving the summary updates My Day, Tasks, the deal timeline and Team view", async () => {
    await api.calls.end("call-blue-harbor-live");
    await api.calls.updateSummary("call-blue-harbor-live", {
      nextAction: "Send the plan and security answer",
    });
    const result = await api.calls.approveSummary("call-blue-harbor-live");

    expect(result.summary.status).toBe("approved");
    expect(result.createdTasks.length).toBeGreaterThanOrEqual(2);
    expect(result.followUp.kind).toBe("post_call");

    // My Day: the item is gone.
    expect((await api.myDay.get()).items.map((i) => i.deal.id)).not.toContain("blue-harbor");
    // Tasks: the new tasks are there, marked as coming from the call.
    const tasks = await api.tasks.list({ status: "open" });
    expect(tasks.filter((t) => t.task.source === "call_summary").map((t) => t.task.title)).toEqual(
      expect.arrayContaining(result.createdTasks.map((t) => t.title)),
    );
    // The deal: today's call is on the timeline, and the next action changed.
    const detail = await api.deals.get("blue-harbor");
    expect(detail.interactions[0]).toMatchObject({ type: "call", callId: "call-blue-harbor-live" });
    expect(detail.deal.nextAction).toBe("Send the plan and security answer");
    // Team view: back on track.
    as("priya");
    expect((await api.team.get()).rows.find((r) => r.deal.id === "blue-harbor")?.deal.status).toBe(
      "on_track",
    );

    as("sam");
    expect((await failure(api.calls.approveSummary("call-blue-harbor-live"))).code).toBe(
      "already_approved",
    );
  });
});

describe("pipeline and assignment", () => {
  it("assigning an unassigned opportunity puts it in the new owner's My Day", async () => {
    as("priya");
    await api.deals.update("nimbus", { ownerId: "jules" });
    as("jules");
    const myDay = await api.myDay.get();
    expect(myDay.items.map((i) => i.deal.id)).toEqual(["nimbus"]);
    expect(myDay.items[0]?.hasDraft).toBe(true);
    as("priya");
    expect((await api.team.get()).rows.find((r) => r.deal.id === "nimbus")?.deal.status).toBe(
      "needs_attention",
    );
  });

  it("only a lead can assign", async () => {
    expect((await failure(api.deals.update("meridian", { ownerId: "jules" }))).status).toBe(403);
  });

  it("moving a deal logs the stage change", async () => {
    await api.deals.update("blue-harbor", { stage: "proposal" });
    const detail = await api.deals.get("blue-harbor");
    expect(detail.deal.stage).toBe("proposal");
    expect(detail.interactions[0]).toMatchObject({
      type: "stage_change",
      summary: "Moved to Proposal",
    });
  });

  it("editing the extracted notes changes the opportunity's next action", async () => {
    await api.deals.updateNotes("meridian", { nextAction: "Book a demo with the CFO" });
    expect((await api.deals.get("meridian")).deal.nextAction).toBe("Book a demo with the CFO");
  });

  it("completing a task shows up in the task list", async () => {
    const [open] = await api.tasks.list({ status: "open" });
    await api.tasks.update(open!.task.id, "done");
    expect((await api.tasks.list({ status: "open" })).map((t) => t.task.id)).not.toContain(
      open!.task.id,
    );
  });
});

describe("knowledge base", () => {
  it("answers the integration question from the Integration guide, with its source", async () => {
    const answer = await api.knowledge.ask("How long does integration take with SAP?");
    expect(answer.status).toBe("answered");
    expect(answer.answer).toContain("six to eight weeks");
    expect(answer.sources[0]).toMatchObject({
      title: "Integration guide",
      version: "v3",
      section: "section 2",
    });
  });

  it("says Not confirmed about a certification the documents do not cover", async () => {
    const answer = await api.knowledge.ask("Do you have a SOC 2 certification?");
    expect(answer).toMatchObject({
      status: "not_confirmed",
      answer: null,
      sources: [],
      confidence: 0,
    });
    expect(answer.holdingLine).toMatch(/confirm that with our team/);
  });

  it("shows the outdated pricing guide next to the new one until it is deactivated", async () => {
    const question = "What is the implementation fee?";
    const before = await api.knowledge.ask(question);
    const names = (a: typeof before) => a.sources.map((s) => `${s.title} ${s.version}`);
    expect(names(before)).toEqual(["Pricing guide v5", "Pricing guide v4"]);

    as("alex");
    await api.knowledge.deactivate("doc-pricing-v4");
    const after = await api.knowledge.ask(question);
    expect(names(after)).toContain("Pricing guide v5");
    expect(names(after)).not.toContain("Pricing guide v4");
  });

  it("replaces a document with a new version and switches the old one off", async () => {
    as("alex");
    const next = await api.knowledge.replace("doc-integration-v3");
    expect(next).toMatchObject({ version: "v4", status: "active" });
    const docs = await api.knowledge.documents();
    expect(docs.find((d) => d.id === "doc-integration-v3")?.status).toBe("inactive");
  });
});

describe("reset", () => {
  it("restores the starting state", async () => {
    await api.myDay.handle("md-meridian");
    await api.session.reset();
    expect((await api.myDay.get()).counts.needYou).toBe(4);
  });
});

describe("settings", () => {
  it("keeps a change", async () => {
    as("alex");
    await api.settings.update({ retentionDays: 30, followUpDays: { proposal: 5 } });
    const settings = await api.settings.get();
    expect(settings.retentionDays).toBe(30);
    expect(settings.followUpDays.proposal).toBe(5);
    expect(settings.followUpDays.discovery).toBe(5);
  });
});

describe("notifications", () => {
  const titles = async () => (await api.notifications.list()).items.map((n) => n.title);

  it("gives each role what it needs to act on", async () => {
    // The time shown is the viewer's local time, so the test matches the shape, not the hour.
    const mine = await titles();
    expect(mine[0]).toMatch(/^Blue Harbor Logistics is today at \d\d:\d\d$/);
    expect(mine[1]).toMatch(/^Solvex Manufacturing is today at \d\d:\d\d$/);
    expect(mine[2]).toBe("4 opportunities need you");
    as("priya");
    expect(await titles()).toContain("Nimbus Freight has no owner");
    expect(await titles()).toContain("Last week's pilot report is ready");
    as("alex");
    expect(await titles()).toContain("Two versions of the Pricing guide are active");
  });

  it("marks everything read, and an admin fix clears the pricing notice", async () => {
    expect((await api.notifications.list()).unread).toBe(3);
    await api.notifications.markAllRead();
    expect((await api.notifications.list()).unread).toBe(0);

    as("alex");
    await api.knowledge.deactivate("doc-pricing-v4");
    expect(await titles()).not.toContain("Two versions of the Pricing guide are active");
  });

  it("starts unread again after a reset", async () => {
    await api.notifications.markAllRead();
    await api.session.reset();
    expect((await api.notifications.list()).unread).toBe(3);
  });
});

describe("the live call script", () => {
  it("plays the Blue Harbor scenario in order, with every kind of card", async () => {
    as("sam");
    const events = await api.calls.scenario("call-blue-harbor-live");

    expect(events[0]?.type).toBe("session.ready");
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => a - b));
    const types = new Set(events.map((e) => e.type));
    for (const type of [
      "transcript.partial",
      "transcript.final",
      "card.start",
      "card.delta",
      "card.end",
      "card.not_confirmed",
      "card.objection",
      "alert.contradiction",
      "suggestion.next_question",
    ]) {
      expect(types.has(type as never), type).toBe(true);
    }
    // The first answer streams in token by token and comes out as the full sentence.
    const answer = events
      .filter((e) => e.type === "card.delta" && e.cardId === "card-integration")
      .map((e) => (e.type === "card.delta" ? e.text : ""))
      .join("");
    expect(answer).toBe(
      "Integration runs in three phases over six to eight weeks, with the ERP connector first.",
    );
  });

  it("has no script for a call that is not scripted", async () => {
    as("sam");
    expect((await failure(api.calls.scenario("call-solvex-qa"))).status).toBe(404);
  });
});
