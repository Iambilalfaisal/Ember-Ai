import { addDays } from "date-fns";
import { MyDay, SnoozeBody, ActionResult } from "../../domain";
import { getNow } from "../clock";
import { db } from "../db";
import { addInteraction, markDealAttended } from "../logic";
import { toCall, toContact, toDeal } from "../mappers";
import { notFound, route } from "./shared";

export const myDayHandlers = [
  route("get", "/my-day", {
    run: ({ user }) => {
      const now = getNow();
      const items = db.myDay
        .findMany({ where: { userId: { equals: user.id } } })
        // A snoozed item comes back when its date arrives.
        .filter(
          (i) =>
            i.state === "open" ||
            (i.state === "snoozed" && i.snoozedUntil !== null && new Date(i.snoozedUntil) <= now),
        )
        .sort((a, b) => b.overdueDays - a.overdueDays)
        .flatMap((i) => {
          const deal = db.deal.findFirst({ where: { id: { equals: i.dealId } } });
          const contact =
            deal && db.contact.findFirst({ where: { id: { equals: deal.primaryContactId } } });
          if (!deal || !contact) return [];
          return [
            {
              id: i.id,
              deal: toDeal(deal),
              contact: toContact(contact),
              reason: i.reason,
              suggestedAction: i.suggestedAction,
              overdueDays: i.overdueDays,
              hasDraft:
                db.draft.count({
                  where: { dealId: { equals: i.dealId }, status: { equals: "draft" } },
                }) > 0,
              hasNotes: db.notes.count({ where: { dealId: { equals: i.dealId } } }) > 0,
            },
          ];
        });

      const calls = db.call
        .findMany({ where: { status: { equals: "upcoming" } } })
        .filter((c) => user.role !== "rep" || c.repId === user.id)
        .filter((c) => new Date(c.startsAt).toDateString() === now.toDateString())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((c) =>
          toCall(c, db.deal.findFirst({ where: { id: { equals: c.dealId } } })?.company ?? ""),
        );

      return MyDay.parse({
        items,
        counts: { needYou: items.length, callsToday: calls.length },
        calls,
      });
    },
  }),

  route("post", "/my-day/:id/handle", {
    run: ({ user, params }) => {
      const item =
        db.myDay.findFirst({ where: { id: { equals: params["id"] ?? "" } } }) ??
        notFound("The item");
      markDealAttended(item.dealId, "Marked handled");
      addInteraction({
        dealId: item.dealId,
        type: "note",
        summary: "Marked handled from My Day",
        userId: user.id,
      });
      return ActionResult.parse({ id: item.id, state: "handled" });
    },
  }),

  route("post", "/my-day/:id/snooze", {
    body: SnoozeBody,
    run: ({ params, body }) => {
      const item =
        db.myDay.findFirst({ where: { id: { equals: params["id"] ?? "" } } }) ??
        notFound("The item");
      db.myDay.update({
        where: { id: { equals: item.id } },
        data: { state: "snoozed", snoozedUntil: addDays(getNow(), body.days).toISOString() },
      });
      return ActionResult.parse({ id: item.id, state: "snoozed" });
    },
  }),
];
