import { RevivalQueue, TeamView } from "../../domain";
import { getNow } from "../clock";
import { db } from "../db";
import { toContact, toDeal, toUser } from "../mappers";
import { route } from "./shared";

export const teamHandlers = [
  // Every active opportunity with its owner and the reason it needs attention (or why it doesn't).
  // The reason comes from the same My Day items the rep sees, so the two views always agree.
  route("get", "/team", {
    roles: ["lead", "admin"],
    run: ({ query }) => {
      const ownerId = query.get("ownerId");
      const status = query.get("status");
      const q = query.get("q")?.toLowerCase();
      const rows = db.deal
        .getAll()
        .filter(
          (d) =>
            d.status !== "revival" &&
            d.status !== "declined" &&
            d.stage !== "won" &&
            d.stage !== "lost",
        )
        .filter((d) => !status || d.status === status)
        .filter(
          (d) => !ownerId || (ownerId === "none" ? d.ownerId === null : d.ownerId === ownerId),
        )
        .filter((d) => !q || d.company.toLowerCase().includes(q))
        .map((d) => {
          const item = db.myDay.findFirst({
            where: { dealId: { equals: d.id }, state: { notEquals: "handled" } },
          });
          const days = Math.round(
            (getNow().getTime() - new Date(d.createdAt).getTime()) / 86_400_000,
          );
          const reason =
            item?.reason ??
            (d.status === "unassigned"
              ? `Nobody owns this yet. It came in ${days} days ago.`
              : d.status === "on_track"
                ? `On track. ${d.lastActivityNote}.`
                : d.lastActivityNote);
          const owner = d.ownerId
            ? db.user.findFirst({ where: { id: { equals: d.ownerId } } })
            : null;
          return { deal: toDeal(d), owner: owner ? toUser(owner) : null, reason };
        })
        // Things that need attention first, then by how long since anyone touched them.
        .sort((a, b) => {
          const rank = (s: string) => (s === "on_track" ? 1 : 0);
          return (
            rank(a.deal.status) - rank(b.deal.status) ||
            a.deal.lastActivityAt.localeCompare(b.deal.lastActivityAt)
          );
        });
      const reps = db.user.findMany({ where: { role: { equals: "rep" } } }).map(toUser);
      return TeamView.parse({ rows, reps });
    },
  }),

  route("get", "/revival", {
    run: ({ user }) => {
      const mine = (ownerId: string | null) => user.role !== "rep" || ownerId === user.id;
      const items = db.deal
        .findMany({ where: { status: { equals: "revival" } } })
        .filter((d) => mine(d.ownerId))
        .sort((a, b) => b.value - a.value)
        .flatMap((d) => {
          const contact = db.contact.findFirst({ where: { id: { equals: d.primaryContactId } } });
          if (!contact || !d.originalNeed || !d.wayBackIn) return [];
          return [
            {
              deal: toDeal(d),
              contact: toContact(contact),
              originalNeed: d.originalNeed,
              wayBackIn: d.wayBackIn,
            },
          ];
        });
      const excludedCount = db.deal
        .findMany({ where: { status: { equals: "declined" } } })
        .filter((d) => mine(d.ownerId)).length;
      return RevivalQueue.parse({ items, excludedCount });
    },
  }),
];
