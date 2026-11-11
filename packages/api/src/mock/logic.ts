import { getNow } from "./clock";
import { db, nextId, type Row } from "./db";
import { ApiError, notFound, type UserRow } from "./handlers/shared";

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
  type: "call" | "email" | "note" | "stage_change";
  summary: string;
  userId: string | null;
  callId?: string | null;
}): Row<"interaction"> {
  return db.interaction.create({
    id: nextId("i"),
    dealId: input.dealId,
    type: input.type,
    at: getNow().toISOString(),
    summary: input.summary,
    userId: input.userId,
    callId: input.callId ?? null,
  });
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
