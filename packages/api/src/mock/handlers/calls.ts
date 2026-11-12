import { z } from "zod";
import {
  ApproveSummaryResult,
  Call,
  CallBrief,
  CallDetail,
  CallSummary,
  CardFeedbackBody,
  EndCallBody,
  LiveEvent,
  UpdateSummaryBody,
} from "../../domain";
import { addDays } from "date-fns";
import { getNow } from "../clock";
import { db, nextId } from "../db";
import { addInteraction, assertCanSeeDeal, getCall, getDeal, markDealAttended } from "../logic";
import { json, toBrief, toCall, toCard, toDraft, toSegment, toSummary, toTask } from "../mappers";
import { composeDraft } from "../seed/drafts";
import { scenarioFor } from "../seed/scenarios";
import { draftSummaryFor } from "../seed/summaries";
import { ApiError, notFound, route } from "./shared";

const company = (dealId: string) =>
  db.deal.findFirst({ where: { id: { equals: dealId } } })?.company ?? "";

function visibleCall(user: { id: string; role: string }, id: string) {
  const call = getCall(id);
  if (user.role === "rep" && call.repId !== user.id) {
    throw new ApiError(403, "forbidden", "That call belongs to someone else.");
  }
  return call;
}

function getSummary(callId: string) {
  return db.summary.findFirst({ where: { callId: { equals: callId } } });
}

export const callHandlers = [
  route("get", "/calls", {
    run: ({ user, query }) => {
      const q = query.get("q")?.toLowerCase();
      const repId = query.get("repId");
      const dealId = query.get("dealId");
      const status = query.get("status");
      const outcome = query.get("outcome")?.toLowerCase();
      const calls = db.call
        .getAll()
        .filter((c) => user.role !== "rep" || c.repId === user.id)
        .filter((c) => !repId || c.repId === repId)
        .filter((c) => !dealId || c.dealId === dealId)
        .filter((c) => !status || c.status === status)
        .filter((c) => !outcome || (c.outcome ?? "").toLowerCase().includes(outcome))
        .map((c) => toCall(c, company(c.dealId)))
        .filter(
          (c) => !q || c.company.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
        )
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      return z.array(Call).parse(calls);
    },
  }),

  route("get", "/calls/:id", {
    run: ({ user, params }) => {
      const call = visibleCall(user, params["id"] ?? "");
      const summary = getSummary(call.id);
      return CallDetail.parse({
        call: toCall(call, company(call.dealId)),
        transcript: db.segment
          .findMany({ where: { callId: { equals: call.id } } })
          .map(toSegment)
          .sort((a, b) => a.atSec - b.atSec),
        cards: db.card
          .findMany({ where: { callId: { equals: call.id } } })
          .map(toCard)
          .sort((a, b) => a.atSec - b.atSec),
        summary: summary ? toSummary(summary) : null,
      });
    },
  }),

  route("get", "/calls/:id/brief", {
    run: ({ user, params }) => {
      const call = visibleCall(user, params["id"] ?? "");
      const brief =
        db.brief.findFirst({ where: { callId: { equals: call.id } } }) ?? notFound("The brief");
      return CallBrief.parse(toBrief(brief));
    },
  }),

  // The scripted live events for a call, when it has a scenario to play.
  route("get", "/calls/:id/scenario", {
    run: ({ user, params }) => {
      const call = visibleCall(user, params["id"] ?? "");
      const events = scenarioFor(call.scenarioId) ?? notFound("A scripted scenario for this call");
      return z.array(LiveEvent).parse(events);
    },
  }),

  // The call is over: it moves to the library, keeps what was said, and produces a draft summary.
  route("post", "/calls/:id/end", {
    body: EndCallBody,
    run: ({ user, params, body }) => {
      const call = visibleCall(user, params["id"] ?? "");
      if (call.status === "completed")
        throw new ApiError(409, "already_ended", "This call has already ended.");
      const brief = db.brief.findFirst({ where: { callId: { equals: call.id } } });
      const content = draftSummaryFor(call, brief?.openQuestions ?? [], getNow());

      db.call.update({
        where: { id: { equals: call.id } },
        data: {
          status: "completed",
          durationMin: body.durationMin ?? call.durationMin,
          outcome: "Summary waiting for approval",
        },
      });
      for (const segment of body.transcript ?? []) {
        db.segment.create({ ...segment, id: `${call.id}-${segment.id}`, callId: call.id });
      }
      for (const card of body.cards ?? []) {
        db.card.create({
          id: `${call.id}-${card.id}`,
          callId: call.id,
          kind: card.kind,
          text: card.text,
          sourceJson: card.source ? json(card.source) : null,
          atSec: card.atSec,
          verdict: card.verdict,
        });
      }
      db.summary.create({
        callId: call.id,
        status: "draft",
        keyPoints: content.keyPoints,
        clientQuestions: content.clientQuestions,
        commitmentsJson: json(content.commitments),
        nextAction: content.nextAction,
        blocker: content.blocker,
      });
      return toSummary(getSummary(call.id) ?? notFound("The summary"));
    },
  }),

  route("get", "/calls/:id/summary", {
    run: ({ user, params }) => {
      const call = visibleCall(user, params["id"] ?? "");
      return CallSummary.parse(toSummary(getSummary(call.id) ?? notFound("The summary")));
    },
  }),

  route("patch", "/calls/:id/summary", {
    body: UpdateSummaryBody,
    run: ({ user, params, body }) => {
      const call = visibleCall(user, params["id"] ?? "");
      const summary = getSummary(call.id) ?? notFound("The summary");
      if (summary.status === "approved")
        throw new ApiError(409, "already_approved", "This summary was already approved.");
      const data = {
        ...(body.keyPoints !== undefined && { keyPoints: body.keyPoints }),
        ...(body.clientQuestions !== undefined && { clientQuestions: body.clientQuestions }),
        ...(body.commitments !== undefined && { commitmentsJson: json(body.commitments) }),
        ...(body.nextAction !== undefined && { nextAction: body.nextAction }),
        ...(body.blocker !== undefined && { blocker: body.blocker }),
      };
      return toSummary(
        db.summary.update({ where: { callId: { equals: call.id } }, data }) ?? summary,
      );
    },
  }),

  // Approving is the action that ripples: tasks are created, the opportunity is updated, My Day and Team
  // view stop flagging it, the call is logged on the timeline and a follow-up draft is ready.
  route("post", "/calls/:id/summary/approve", {
    run: ({ user, params }) => {
      const call = visibleCall(user, params["id"] ?? "");
      const deal = getDeal(call.dealId);
      assertCanSeeDeal(user, deal);
      const row = getSummary(call.id) ?? notFound("The summary");
      if (row.status === "approved")
        throw new ApiError(409, "already_approved", "This summary was already approved.");
      const summary = toSummary(row);

      const createdTasks = [
        ...summary.commitments.map((c) => ({ title: c.text, dueAt: c.dueAt })),
        ...(summary.nextAction && !summary.commitments.some((c) => c.text === summary.nextAction)
          ? [{ title: summary.nextAction, dueAt: addDays(getNow(), 2).toISOString() }]
          : []),
      ].map((t) =>
        toTask(
          db.task.create({
            id: nextId("t"),
            dealId: deal.id,
            title: t.title,
            dueAt: t.dueAt,
            ownerId: call.repId,
            status: "open",
            source: "call_summary",
          }),
        ),
      );

      db.summary.update({ where: { callId: { equals: call.id } }, data: { status: "approved" } });
      db.call.update({
        where: { id: { equals: call.id } },
        data: { outcome: summary.keyPoints[0] ?? "Summary approved" },
      });
      addInteraction({
        dealId: deal.id,
        type: "call",
        summary: `${call.title}. ${summary.keyPoints[0] ?? ""}`.trim(),
        userId: user.id,
        callId: call.id,
      });
      markDealAttended(deal.id, `Call: ${call.title}`);
      db.deal.update({
        where: { id: { equals: deal.id } },
        data: { nextAction: summary.nextAction || null, blocker: summary.blocker || null },
      });

      const contact = db.contact.findFirst({ where: { id: { equals: deal.primaryContactId } } });
      const draftContent = composeDraft(
        {
          firstName: contact?.name.split(" ")[0] ?? "",
          company: deal.company,
          topic: "What we covered today",
          fact: summary.commitments[0]
            ? `${summary.commitments[0].text}.`
            : (summary.keyPoints[0] ?? ""),
          senderFirstName: user.name.split(" ")[0] ?? "",
        },
        1,
      );
      const followUp = toDraft(
        db.draft.create({
          id: nextId("dr"),
          dealId: deal.id,
          kind: "post_call",
          subject: draftContent.subject,
          body: draftContent.body,
          factsUsed: draftContent.factsUsed,
          status: "draft",
          version: 1,
        }),
      );
      return ApproveSummaryResult.parse({
        summary: toSummary(getSummary(call.id) ?? row),
        createdTasks,
        followUp,
      });
    },
  }),

  route("post", "/calls/:callId/cards/:cardId/feedback", {
    body: CardFeedbackBody,
    run: ({ params, body }) => {
      const card = db.card.update({
        where: { id: { equals: params["cardId"] ?? "" } },
        data: { verdict: body.verdict },
      });
      return toCard(card ?? notFound("The card"));
    },
  }),
];
