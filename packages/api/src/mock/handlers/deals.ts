import { z } from "zod";
import {
  ContactRow,
  CreateDealBody,
  Deal,
  ImportDealsBody,
  ImportResult,
  UpdateContactBody,
  DealDetail,
  DiscoveryNotes,
  Task,
  TaskRow,
  UpdateDealBody,
  UpdateNotesBody,
  UpdateTaskBody,
} from "../../domain";
import { getNow } from "../clock";
import { db, nextId } from "../db";
import {
  addAudit,
  addInteraction,
  assertCanSeeDeal,
  assignDeal,
  canSeeDeal,
  getDeal,
} from "../logic";
import {
  toCall,
  toContact,
  toDeal,
  toInteraction,
  toNotes,
  toSummary,
  toTask,
  toUser,
} from "../mappers";
import { ApiError, notFound, route, STAGE_LABEL } from "./shared";

const HIDDEN = ["revival", "declined"];

/** A new opportunity starts in Discovery, owned by whoever added it. */
function createDeal(userId: string, body: CreateDealBody) {
  const now = getNow().toISOString();
  const id = nextId("deal");
  const contactId = nextId("c");
  db.contact.create({
    id: contactId,
    dealId: id,
    name: body.contactName,
    title: body.contactTitle,
    email: body.contactEmail,
    phone: null,
    role: "other",
    status: "active",
  });
  return db.deal.create({
    id,
    company: body.company,
    stage: "discovery",
    value: body.value,
    ownerId: userId,
    heat: "warm",
    status: "on_track",
    lastActivityAt: now,
    lastActivityNote: "Added to Ember",
    nextAction: null,
    blocker: null,
    primaryContactId: contactId,
    originalNeed: null,
    wayBackIn: null,
    createdAt: now,
    nextActionDueAt: null,
    lastMeaningfulAt: null,
    source: body.source,
    currency: body.currency,
    closeReason: null,
    stageChangedAt: now,
  });
}

export const dealHandlers = [
  route("get", "/deals", {
    run: ({ user, query }) => {
      const stage = query.get("stage");
      const ownerId = query.get("ownerId");
      const status = query.get("status");
      const q = query.get("q")?.toLowerCase();
      const deals = db.deal
        .getAll()
        .filter((d) => canSeeDeal(user, d))
        // Revival candidates and declined contacts have their own queue, not the pipeline.
        .filter((d) => (status ? d.status === status : !HIDDEN.includes(d.status)))
        .filter((d) => !stage || d.stage === stage)
        .filter(
          (d) => !ownerId || (ownerId === "none" ? d.ownerId === null : d.ownerId === ownerId),
        )
        .filter((d) => !q || d.company.toLowerCase().includes(q))
        .sort((a, b) => b.value - a.value);
      return z.array(Deal).parse(deals.map(toDeal));
    },
  }),

  route("get", "/deals/:id", {
    run: ({ user, params }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      const interactions = db.interaction
        .findMany({ where: { dealId: { equals: deal.id } } })
        .map(toInteraction)
        .sort((a, b) => b.at.localeCompare(a.at));
      const calls = db.call.findMany({ where: { dealId: { equals: deal.id } } });
      const latestApproved = calls
        .filter((c) => c.status === "completed")
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .map((c) =>
          db.summary.findFirst({
            where: { callId: { equals: c.id }, status: { equals: "approved" } },
          }),
        )
        .find((s) => s && s.keyPoints.length > 0);
      const upcoming = calls
        .filter((c) => c.status === "upcoming")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      const owner = deal.ownerId
        ? db.user.findFirst({ where: { id: { equals: deal.ownerId } } })
        : null;
      return DealDetail.parse({
        deal: toDeal(deal),
        owner: owner ? toUser(owner) : null,
        contacts: db.contact.findMany({ where: { dealId: { equals: deal.id } } }).map(toContact),
        interactions,
        tasks: db.task.findMany({ where: { dealId: { equals: deal.id } } }).map(toTask),
        latestSummary: latestApproved ? toSummary(latestApproved).keyPoints.join(" ") : null,
        upcomingCall: upcoming ? toCall(upcoming, deal.company) : null,
      });
    },
  }),

  route("patch", "/deals/:id", {
    body: UpdateDealBody,
    run: ({ user, params, body }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      const now = getNow().toISOString();

      if (body.ownerId !== undefined) {
        if (user.role === "rep")
          throw new ApiError(403, "forbidden", "Only a team lead can assign an opportunity.");
        if (
          body.ownerId !== null &&
          !db.user.findFirst({ where: { id: { equals: body.ownerId } } })
        ) {
          throw new ApiError(400, "invalid_request", "That person doesn't exist.");
        }
        assignDeal(deal, body.ownerId, user.id);
      }

      if (body.stage !== undefined && body.stage !== deal.stage) {
        const closing = body.stage === "won" || body.stage === "lost";
        if (closing && !body.closeReason?.trim()) {
          throw new ApiError(
            400,
            "reason_required",
            `Say why it is ${body.stage === "won" ? "won" : "lost"} before closing it.`,
          );
        }
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: {
            stage: body.stage,
            lastActivityAt: now,
            lastActivityNote: `Moved to ${STAGE_LABEL[body.stage]}`,
            closeReason: closing ? (body.closeReason ?? null) : null,
            stageChangedAt: now,
          },
        });
        addInteraction({
          dealId: deal.id,
          type: "stage_change",
          summary: `Moved to ${STAGE_LABEL[body.stage]}${closing ? `: ${body.closeReason}` : ""}`,
          userId: user.id,
          fromStage: deal.stage,
          toStage: body.stage,
        });
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "stage_changed",
          summary: `Moved from ${STAGE_LABEL[deal.stage]} to ${STAGE_LABEL[body.stage]}${closing ? ` (${body.closeReason})` : ""}`,
          via: "manual",
        });
        if (closing) {
          // A closed deal leaves My Day.
          db.myDay.updateMany({
            where: { dealId: { equals: deal.id }, state: { notEquals: "handled" } },
            data: { state: "handled", snoozedUntil: null },
          });
        }
      }

      if (body.nextActionDueAt !== undefined) {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: { nextActionDueAt: body.nextActionDueAt },
        });
      }
      if (body.source !== undefined) {
        db.deal.update({ where: { id: { equals: deal.id } }, data: { source: body.source } });
      }

      if (body.nextAction !== undefined) {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: { nextAction: body.nextAction },
        });
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "next_action_set",
          summary: body.nextAction ? `Next action: ${body.nextAction}` : "Cleared the next action",
          via: "manual",
        });
      }
      if (body.blocker !== undefined) {
        db.deal.update({ where: { id: { equals: deal.id } }, data: { blocker: body.blocker } });
      }
      return toDeal(getDeal(deal.id));
    },
  }),

  route("post", "/deals", {
    body: CreateDealBody,
    run: ({ user, body }) => Deal.parse(toDeal(createDeal(user.id, body))),
  }),

  // CSV import: the screen parses the file, the server validates every row and reports what it skipped.
  route("post", "/deals/import", {
    body: ImportDealsBody,
    run: ({ user, body }) => {
      const skipped: { row: number; reason: string }[] = [];
      const seen = new Set(db.contact.getAll().map((c) => c.email.toLowerCase()));
      let created = 0;
      body.rows.forEach((r, i) => {
        const email = r.contactEmail.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          skipped.push({ row: i + 1, reason: "Email address is not valid" });
        } else if (seen.has(email)) {
          skipped.push({ row: i + 1, reason: "Already in Ember" });
        } else {
          seen.add(email);
          createDeal(user.id, { ...r, contactEmail: email });
          created += 1;
        }
      });
      return ImportResult.parse({ created, skipped });
    },
  }),

  route("patch", "/contacts/:id", {
    body: UpdateContactBody,
    run: ({ user, params, body }) => {
      const contact =
        db.contact.findFirst({ where: { id: { equals: params["id"] ?? "" } } }) ??
        notFound("The contact");
      const deal = getDeal(contact.dealId);
      assertCanSeeDeal(user, deal);
      db.contact.update({
        where: { id: { equals: contact.id } },
        data: {
          ...(body.role && { role: body.role }),
          ...(body.status && { status: body.status }),
        },
      });
      if (body.status === "opted_out") {
        // Opting out closes every open item for the deal and removes pending drafts.
        db.myDay.updateMany({
          where: { dealId: { equals: deal.id }, state: { notEquals: "handled" } },
          data: { state: "handled", snoozedUntil: null },
        });
        db.draft.deleteMany({
          where: { dealId: { equals: deal.id }, status: { equals: "draft" } },
        });
        addInteraction({
          dealId: deal.id,
          type: "note",
          summary: `${contact.name} opted out`,
          userId: user.id,
        });
        addAudit({
          userId: user.id,
          dealId: deal.id,
          action: "opted_out",
          summary: `${contact.name} opted out. Nothing more will be drafted or sent to them.`,
          via: "manual",
        });
      }
      return toContact(db.contact.findFirst({ where: { id: { equals: contact.id } } }) ?? contact);
    },
  }),

  route("get", "/deals/:id/notes", {
    run: ({ user, params }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      const notes =
        db.notes.findFirst({ where: { dealId: { equals: deal.id } } }) ??
        notFound("The discovery notes");
      return DiscoveryNotes.parse(toNotes(notes));
    },
  }),

  route("patch", "/deals/:id/notes", {
    body: UpdateNotesBody,
    run: ({ user, params, body }) => {
      const deal = getDeal(params["id"] ?? "");
      assertCanSeeDeal(user, deal);
      if (!db.notes.findFirst({ where: { dealId: { equals: deal.id } } })) {
        notFound("The discovery notes");
      }
      const data = {
        ...(body.openQuestion !== undefined && { openQuestion: body.openQuestion }),
        ...(body.nextAction !== undefined && { nextAction: body.nextAction }),
        ...(body.blocker !== undefined && { blocker: body.blocker }),
      };
      const updated = db.notes.update({ where: { dealId: { equals: deal.id } }, data });
      // What was extracted is also what the opportunity shows as its next action and blocker.
      db.deal.update({
        where: { id: { equals: deal.id } },
        data: {
          ...(body.nextAction !== undefined && { nextAction: body.nextAction }),
          ...(body.blocker !== undefined && { blocker: body.blocker || null }),
        },
      });
      return toNotes(updated ?? notFound("The discovery notes"));
    },
  }),

  route("get", "/contacts", {
    run: ({ user, query }) => {
      const q = query.get("q")?.toLowerCase();
      const rows = db.contact
        .getAll()
        .flatMap((c) => {
          const deal = db.deal.findFirst({ where: { id: { equals: c.dealId } } });
          return deal && canSeeDeal(user, deal) && !HIDDEN.includes(deal.status)
            ? [{ contact: toContact(c), company: deal.company, dealId: deal.id }]
            : [];
        })
        .filter(
          (r) =>
            !q || r.contact.name.toLowerCase().includes(q) || r.company.toLowerCase().includes(q),
        )
        .sort((a, b) => a.contact.name.localeCompare(b.contact.name));
      return z.array(ContactRow).parse(rows);
    },
  }),

  route("get", "/tasks", {
    run: ({ user, query }) => {
      const status = query.get("status");
      const rows = db.task
        .getAll()
        .filter((t) => user.role !== "rep" || t.ownerId === user.id)
        .filter((t) => !status || t.status === status)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map((t) => ({
          task: toTask(t),
          company: db.deal.findFirst({ where: { id: { equals: t.dealId } } })?.company ?? "",
        }));
      return z.array(TaskRow).parse(rows);
    },
  }),

  route("patch", "/tasks/:id", {
    body: UpdateTaskBody,
    run: ({ params, body }) => {
      const task = db.task.update({
        where: { id: { equals: params["id"] ?? "" } },
        data: { status: body.status },
      });
      return Task.parse(task ?? notFound("The task"));
    },
  }),
];
