import { z } from "zod";
import {
  ContactRow,
  Deal,
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
import { addInteraction, assertCanSeeDeal, canSeeDeal, getDeal, userName } from "../logic";
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
import { composeDraft } from "../seed/drafts";
import { ApiError, notFound, route, STAGE_LABEL } from "./shared";

const HIDDEN = ["revival", "declined"];

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
        const wasUnassigned = deal.ownerId === null;
        db.deal.update({ where: { id: { equals: deal.id } }, data: { ownerId: body.ownerId } });
        addInteraction({
          dealId: deal.id,
          type: "note",
          summary: `Assigned to ${userName(body.ownerId)}`,
          userId: user.id,
        });
        if (body.ownerId) {
          // Open items follow the owner. A newly assigned opportunity lands in their My Day.
          db.myDay.updateMany({
            where: { dealId: { equals: deal.id }, state: { notEquals: "handled" } },
            data: { userId: body.ownerId },
          });
          if (wasUnassigned) {
            const contact = db.contact.findFirst({
              where: { id: { equals: deal.primaryContactId } },
            });
            const days = Math.max(
              1,
              Math.round((getNow().getTime() - new Date(deal.createdAt).getTime()) / 86_400_000),
            );
            db.myDay.create({
              id: nextId("md"),
              dealId: deal.id,
              userId: body.ownerId,
              reason: `Assigned to you. ${contact?.name ?? "The contact"} wrote in ${days} days ago and nobody has replied.`,
              suggestedAction: "Send a first reply",
              overdueDays: days,
              state: "open",
            });
            const content = composeDraft(
              {
                firstName: contact?.name.split(" ")[0] ?? "",
                company: deal.company,
                topic: "Your request",
                fact: "Thanks for getting in touch. I'd like to understand what you're hoping to fix.",
                senderFirstName: userName(body.ownerId).split(" ")[0] ?? "",
              },
              1,
            );
            db.draft.create({
              id: nextId("dr"),
              dealId: deal.id,
              kind: "follow_up",
              subject: content.subject,
              body: content.body,
              factsUsed: content.factsUsed,
              status: "draft",
              version: 1,
            });
            db.deal.update({
              where: { id: { equals: deal.id } },
              data: { status: "needs_attention", nextAction: "Send a first reply" },
            });
          }
        } else {
          db.deal.update({ where: { id: { equals: deal.id } }, data: { status: "unassigned" } });
        }
      }

      if (body.stage !== undefined && body.stage !== deal.stage) {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: {
            stage: body.stage,
            lastActivityAt: now,
            lastActivityNote: `Moved to ${STAGE_LABEL[body.stage]}`,
          },
        });
        addInteraction({
          dealId: deal.id,
          type: "stage_change",
          summary: `Moved to ${STAGE_LABEL[body.stage]}`,
          userId: user.id,
        });
      }

      if (body.nextAction !== undefined) {
        db.deal.update({
          where: { id: { equals: deal.id } },
          data: { nextAction: body.nextAction },
        });
      }
      if (body.blocker !== undefined) {
        db.deal.update({ where: { id: { equals: deal.id } }, data: { blocker: body.blocker } });
      }
      return toDeal(getDeal(deal.id));
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
