import { addDays } from "date-fns";
import { z } from "zod";
import {
  AuditEntry,
  Digest,
  LogCallBody,
  LogCallResult,
  NotificationPrefs,
  Suggestion,
} from "../../domain";
import { getNow } from "../clock";
import { db, nextId, type Row } from "../db";
import {
  addAudit,
  addInteraction,
  assertCanSeeDeal,
  assignDeal,
  canSeeDeal,
  getDeal,
  isOptedOut,
  markDealAttended,
  userName,
} from "../logic";
import { toCall } from "../mappers";
import { composeDraft } from "../seed/drafts";
import { ApiError, notFound, route, type UserRow } from "./shared";

const CLOSED_OR_HIDDEN = ["revival", "declined"];

const isActive = (d: Row<"deal">) =>
  d.stage !== "won" && d.stage !== "lost" && !CLOSED_OR_HIDDEN.includes(d.status);

const mineOrAll = (user: UserRow, d: Row<"deal">) =>
  user.role === "rep" ? d.ownerId === user.id : true;

function toSuggestion(row: Row<"suggestion">): Suggestion {
  const deal = getDeal(row.dealId);
  return Suggestion.parse({
    id: row.id,
    dealId: row.dealId,
    company: deal.company,
    ownerName: userName(row.userId),
    kind: row.kind,
    title: row.title,
    why: row.why,
    facts: JSON.parse(row.factsJson) as string[],
    proposedAction: row.proposedAction,
    proposedDueAt: row.proposedDueAt,
    state: row.state,
  });
}

function getSuggestion(user: UserRow, id: string): Row<"suggestion"> {
  const row =
    db.suggestion.findFirst({ where: { id: { equals: id } } }) ?? notFound("The suggestion");
  if (user.role === "rep" && row.userId !== user.id)
    throw new ApiError(403, "forbidden", "That suggestion is for someone else.");
  return row;
}

// A rep sees their own suggestions. A lead or admin sees the whole team's and may decide any of them
// (the audit log records who approved).
const suggestionsFor = (user: UserRow) =>
  user.role === "rep"
    ? db.suggestion.findMany({ where: { userId: { equals: user.id } } })
    : db.suggestion.getAll();

const DEFAULT_PREFS = {
  digestInApp: true,
  digestEmail: false,
  remindersInApp: true,
  remindersEmail: false,
  digestHour: 8,
};

function getPrefs(userId: string): NotificationPrefs {
  const row =
    db.prefs.findFirst({ where: { userId: { equals: userId } } }) ??
    db.prefs.create({ userId, ...DEFAULT_PREFS });
  return NotificationPrefs.parse(row);
}

function draftFor(deal: Row<"deal">, user: UserRow, topic: string, fact: string) {
  const contact = db.contact.findFirst({ where: { id: { equals: deal.primaryContactId } } });
  const content = composeDraft(
    {
      firstName: contact?.name.split(" ")[0] ?? "",
      company: deal.company,
      topic,
      fact,
      senderFirstName: (deal.ownerId ? userName(deal.ownerId) : user.name).split(" ")[0] ?? "",
    },
    1,
  );
  return db.draft.create({
    id: nextId("dr"),
    dealId: deal.id,
    kind: "follow_up",
    subject: content.subject,
    body: content.body,
    factsUsed: content.factsUsed,
    status: "draft",
    version: 1,
  });
}

export const copilotHandlers = [
  // The morning digest: what changed overnight and what needs the person first.
  route("get", "/copilot/digest", {
    run: ({ user }) => {
      const now = getNow();
      const deals = db.deal.getAll().filter((d) => canSeeDeal(user, d) && mineOrAll(user, d));
      const active = deals.filter(isActive);
      const items = db.myDay
        .findMany({ where: { userId: { equals: user.id } } })
        .filter(
          (i) =>
            i.state === "open" ||
            (i.state === "snoozed" && i.snoozedUntil !== null && new Date(i.snoozedUntil) <= now),
        )
        .filter((i) => {
          const d = db.deal.findFirst({ where: { id: { equals: i.dealId } } });
          return d ? !isOptedOut(d) : false;
        })
        .sort((a, b) => b.overdueDays - a.overdueDays);
      const calls = db.call
        .findMany({ where: { status: { equals: "upcoming" } } })
        .filter((c) => user.role !== "rep" || c.repId === user.id)
        .filter((c) => c.startsAt.slice(0, 10) === now.toISOString().slice(0, 10))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const pending = suggestionsFor(user).filter((s) => s.state === "pending").length;
      const revival = db.deal
        .findMany({ where: { status: { equals: "revival" } } })
        .filter((d) => mineOrAll(user, d) && !isOptedOut(d)).length;
      const overdue = active.filter(
        (d) => d.nextActionDueAt !== null && new Date(d.nextActionDueAt) < now,
      ).length;
      const noNextAction = active.filter((d) => d.nextAction === null).length;
      const first = calls[0];
      const firstCompany = first
        ? (db.deal.findFirst({ where: { id: { equals: first.dealId } } })?.company ?? "")
        : "";
      const hour = now.getHours();
      const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      const needYou = items.length;
      return Digest.parse({
        greeting: `Good ${part}, ${user.name.split(" ")[0]}`,
        headline:
          needYou === 0
            ? "Nothing is waiting on you. A good moment to look at the revival queue."
            : `${needYou} ${needYou === 1 ? "opportunity needs" : "opportunities need"} you today${calls.length ? `, and you have ${calls.length} ${calls.length === 1 ? "call" : "calls"}` : ""}.`,
        counts: {
          needYou,
          overdue,
          noNextAction,
          callsToday: calls.length,
          suggestions: pending,
          revival,
        },
        highlights: items.slice(0, 3).flatMap((i) => {
          const d = db.deal.findFirst({ where: { id: { equals: i.dealId } } });
          return d ? [{ dealId: d.id, company: d.company, text: i.reason }] : [];
        }),
        nextCall: first ? toCall(first, firstCompany) : null,
      });
    },
  }),

  route("get", "/copilot/suggestions", {
    run: ({ user }) => {
      const rows = suggestionsFor(user);
      const order = { pending: 0, approved: 1, dismissed: 2 } as Record<string, number>;
      return z
        .array(Suggestion)
        .parse(
          rows.map(toSuggestion).sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3)),
        );
    },
  }),

  // Approving is the only way a suggestion changes anything. Every approval writes an audit entry.
  route("post", "/copilot/suggestions/:id/approve", {
    run: ({ user, params }) => {
      const row = getSuggestion(user, params["id"] ?? "");
      if (row.state !== "pending")
        throw new ApiError(409, "already_decided", "This suggestion was already decided.");
      const deal = getDeal(row.dealId);
      if (isOptedOut(deal))
        throw new ApiError(
          409,
          "opted_out",
          "This contact opted out. Nothing can be done for them.",
        );

      if (row.kind === "set_next_action") {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: { nextAction: row.proposedAction, nextActionDueAt: row.proposedDueAt },
        });
        db.task.create({
          id: nextId("t"),
          dealId: deal.id,
          title: row.proposedAction,
          dueAt: row.proposedDueAt ?? addDays(getNow(), 2).toISOString(),
          ownerId: deal.ownerId ?? user.id,
          status: "open",
          source: "follow_up",
        });
        addInteraction({
          dealId: deal.id,
          type: "note",
          summary: `Next action set: ${row.proposedAction}`,
          userId: user.id,
        });
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "next_action_set",
          summary: `Next action: ${row.proposedAction}`,
          via: "copilot",
        });
      } else if (row.kind === "nudge_draft") {
        const facts = JSON.parse(row.factsJson) as string[];
        draftFor(deal, user, row.title, facts[0] ?? row.why);
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "draft_created",
          summary: `Draft ready to review: ${row.proposedAction}`,
          via: "copilot",
        });
      } else if (row.kind === "revive") {
        const ownerId = deal.ownerId ?? user.id;
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: {
            status: "needs_attention",
            heat: "cooling",
            nextAction: row.proposedAction,
            nextActionDueAt: row.proposedDueAt,
          },
        });
        db.myDay.create({
          id: nextId("md"),
          dealId: deal.id,
          userId: ownerId,
          reason: row.why,
          suggestedAction: row.proposedAction,
          overdueDays: 0,
          state: "open",
        });
        draftFor(deal, user, "Picking this back up", deal.wayBackIn ?? row.why);
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "deal_revived",
          summary: `Brought back from the revival queue: ${row.proposedAction}`,
          via: "copilot",
        });
      } else {
        const ownerId = row.assigneeId;
        if (user.role === "rep")
          throw new ApiError(403, "forbidden", "Only a team lead can assign an opportunity.");
        if (!ownerId)
          throw new ApiError(400, "invalid_request", "There is nobody to assign it to.");
        assignDeal(deal, ownerId, user.id, "copilot");
      }

      db.suggestion.update({ where: { id: { equals: row.id } }, data: { state: "approved" } });
      return toSuggestion(db.suggestion.findFirst({ where: { id: { equals: row.id } } }) ?? row);
    },
  }),

  route("post", "/copilot/suggestions/:id/dismiss", {
    run: ({ user, params }) => {
      const row = getSuggestion(user, params["id"] ?? "");
      if (row.state !== "pending")
        throw new ApiError(409, "already_decided", "This suggestion was already decided.");
      db.suggestion.update({ where: { id: { equals: row.id } }, data: { state: "dismissed" } });
      return toSuggestion(db.suggestion.findFirst({ where: { id: { equals: row.id } } }) ?? row);
    },
  }),

  // What changed and who approved it. A rep sees their own, a lead sees everyone's.
  route("get", "/audit", {
    run: ({ user, query }) => {
      const limit = Number(query.get("limit") ?? "100");
      const dealId = query.get("dealId");
      return z.array(AuditEntry).parse(
        db.audit
          .getAll()
          .filter((a) => user.role !== "rep" || a.userId === user.id)
          .filter((a) => !dealId || a.dealId === dealId)
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit)
          .map((a) => ({ ...a, approvedBy: userName(a.userId) })),
      );
    },
  }),

  // A call that happened outside Teams: phone, WhatsApp or in person. Ember learns from it like any other.
  route("post", "/deals/:id/log-call", {
    body: LogCallBody,
    run: ({ user, params, body }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      if (isOptedOut(deal))
        throw new ApiError(409, "opted_out", "This contact opted out. Don't log new contact.");
      const label = {
        phone: "Phone call",
        whatsapp: "WhatsApp call",
        video: "Video call",
        in_person: "Meeting",
      }[body.channel];
      const interaction = addInteraction({
        dealId: deal.id,
        type: body.channel === "in_person" ? "meeting" : "call",
        summary: `${label}: ${body.summary}`,
        userId: user.id,
      });
      body.commitments.forEach((text) =>
        db.task.create({
          id: nextId("t"),
          dealId: deal.id,
          title: text,
          dueAt: addDays(getNow(), 2).toISOString(),
          ownerId: user.id,
          status: "open",
          source: "manual",
        }),
      );
      markDealAttended(deal.id, `${label} logged`);
      if (body.nextAction) {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: {
            nextAction: body.nextAction,
            nextActionDueAt: addDays(getNow(), 3).toISOString(),
          },
        });
      }
      addAudit({
        userId: user.id,
        dealId: deal.id,
        action: "call_logged",
        summary: `${label} logged. ${body.commitments.length} ${body.commitments.length === 1 ? "task" : "tasks"} created from it.`,
        via: "manual",
      });
      return LogCallResult.parse({
        interactionId: interaction.id,
        tasksCreated: body.commitments.length,
      });
    },
  }),

  route("get", "/me/preferences", { run: ({ user }) => getPrefs(user.id) }),

  route("patch", "/me/preferences", {
    body: NotificationPrefs.partial(),
    run: ({ user, body }) => {
      getPrefs(user.id);
      db.prefs.update({
        where: { userId: { equals: user.id } },
        data: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
      });
      return getPrefs(user.id);
    },
  }),
];
