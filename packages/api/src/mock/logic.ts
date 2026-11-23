import { getNow } from "./clock";
import { db, nextId, type Row } from "./db";
import { ApiError, notFound, type UserRow } from "./handlers/shared";
import { composeDraft } from "./seed/drafts";

// Behaviour that more than one endpoint shares. This is what makes the mock act like a backend:
// one action changes every screen that depends on it.

export function getDeal(id: string): Row<"deal"> {
  return db.deal.findFirst({ where: { id: { equals: id } } }) ?? notFound("The opportunity");
}

export function getCall(id: string): Row<"call"> {
  return db.call.findFirst({ where: { id: { equals: id } } }) ?? notFound("The call");
}

/** Reps see their own opportunities. Leads and admins see all of them. */
export function canSeeDeal(user: UserRow, deal: Row<"deal">): boolean {
  return user.role !== "rep" || deal.ownerId === user.id;
}

export function assertCanSeeDeal(user: UserRow, deal: Row<"deal">): void {
  if (!canSeeDeal(user, deal)) {
    throw new ApiError(403, "forbidden", "That opportunity belongs to someone else.");
  }
}

export function addInteraction(input: {
  dealId: string;
  type: "call" | "meeting" | "email" | "note" | "stage_change";
  summary: string;
  userId: string | null;
  callId?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
}): Row<"interaction"> {
  const row = db.interaction.create({
    id: nextId("i"),
    dealId: input.dealId,
    type: input.type,
    at: getNow().toISOString(),
    summary: input.summary,
    userId: input.userId,
    callId: input.callId ?? null,
    fromStage: input.fromStage ?? null,
    toStage: input.toStage ?? null,
  });
  // Only a call, meeting or real email counts as meaningful contact.
  if (input.type === "call" || input.type === "meeting" || input.type === "email") {
    db.deal.update({
      where: { id: { equals: input.dealId } },
      data: { lastMeaningfulAt: getNow().toISOString() },
    });
  }

  return row;
}

/**
 * The opportunity has been dealt with: its open My Day items are closed, it is warm and on track again,
 * and its last activity is now. Called when a draft is sent, an item is marked handled or a summary is
 * approved, so My Day, Team view and the deal all agree.
 */
export function markDealAttended(dealId: string, note: string): void {
  db.myDay.updateMany({
    where: { dealId: { equals: dealId }, state: { notEquals: "handled" } },
    data: { state: "handled", snoozedUntil: null },
  });
  db.deal.update({
    where: { id: { equals: dealId } },
    data: {
      status: "on_track",
      heat: "warm",
      lastActivityAt: getNow().toISOString(),
      lastActivityNote: note,
    },
  });
}

export function userName(id: string | null): string {
  if (!id) return "Nobody";
  return db.user.findFirst({ where: { id: { equals: id } } })?.name ?? id;
}

/** True when the deal's primary contact asked not to be contacted. */
export function isOptedOut(deal: Row<"deal">): boolean {
  const c = db.contact.findFirst({ where: { id: { equals: deal.primaryContactId } } });
  return c?.status === "opted_out";
}

type AuditAction =
  | "next_action_set"
  | "draft_created"
  | "draft_sent"
  | "tasks_created"
  | "stage_changed"
  | "call_logged"
  | "owner_assigned"
  | "opted_out"
  | "deal_revived";

/** Records a change a person approved. The copilot never writes to a deal without one of these. */
export function addAudit(input: {
  userId: string;
  dealId: string;
  action: AuditAction;
  summary: string;
  via: "copilot" | "manual";
}): void {
  db.audit.create({
    id: nextId("au"),
    at: getNow().toISOString(),
    userId: input.userId,
    dealId: input.dealId,
    company: getDeal(input.dealId).company,
    action: input.action,
    summary: input.summary,
    via: input.via,
  });
}

/**
 * Gives an opportunity an owner. A newly assigned one lands in the owner's My Day with a first reply
 * already drafted. Passing null leaves it unassigned.
 */
export function assignDeal(
  deal: Row<"deal">,
  ownerId: string | null,
  actorId: string,
  via: "copilot" | "manual" = "manual",
): void {
  const wasUnassigned = deal.ownerId === null;
  db.deal.update({ where: { id: { equals: deal.id } }, data: { ownerId } });
  addInteraction({
    dealId: deal.id,
    type: "note",
    summary: `Assigned to ${userName(ownerId)}`,
    userId: actorId,
  });
  if (ownerId) {
    // Open items follow the owner. A newly assigned opportunity lands in their My Day.
    db.myDay.updateMany({
      where: { dealId: { equals: deal.id }, state: { notEquals: "handled" } },
      data: { userId: ownerId },
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
        userId: ownerId,
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
          senderFirstName: userName(ownerId).split(" ")[0] ?? "",
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
  addAudit({
    userId: actorId,
    dealId: deal.id,
    action: "owner_assigned",
    summary: ownerId ? `Assigned to ${userName(ownerId)}` : "Left unassigned",
    via,
  });
}
