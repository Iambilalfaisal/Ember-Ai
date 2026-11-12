import { format } from "date-fns";
import { NotificationList, type Notification } from "../../domain";
import { getNow } from "../clock";
import { db, readNotifications } from "../db";
import { route } from "./shared";

// Notifications are worked out from the same data as every other screen, so they never disagree
// with My Day, Team view or the knowledge base.

const minutesAgo = (minutes: number) =>
  new Date(getNow().getTime() - minutes * 60_000).toISOString();

type Viewer = { id: string; role: string };

function notificationsFor(user: Viewer): NotificationList {
  const seen = readNotifications.get(user.id) ?? new Set<string>();
  const items: Omit<Notification, "read">[] = [];

  const calls = db.call
    .findMany({ where: { status: { equals: "upcoming" } } })
    .filter((c) => user.role !== "rep" || c.repId === user.id)
    .filter((c) => new Date(c.startsAt).toDateString() === getNow().toDateString())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const call of calls) {
    const company = db.deal.findFirst({ where: { id: { equals: call.dealId } } })?.company;
    items.push({
      id: `call-${call.id}`,
      title: `${company ?? "A call"} is today at ${format(new Date(call.startsAt), "HH:mm")}`,
      body: "The brief and call plan are ready.",
      href: `/calls/${call.id}/prep`,
      createdAt: minutesAgo(35),
    });
  }

  const attention = db.myDay.count({
    where: { userId: { equals: user.id }, state: { equals: "open" } },
  });
  if (attention > 0) {
    items.push({
      id: "my-day",
      title: `${attention} ${attention === 1 ? "opportunity needs" : "opportunities need"} you`,
      body: "Each one has a reason and a draft ready.",
      href: "/my-day",
      createdAt: minutesAgo(90),
    });
  }

  if (user.role !== "rep") {
    for (const deal of db.deal.findMany({ where: { status: { equals: "unassigned" } } })) {
      items.push({
        id: `unassigned-${deal.id}`,
        title: `${deal.company} has no owner`,
        body: "It came in from the website. Assign it to a rep.",
        href: "/team",
        createdAt: minutesAgo(180),
      });
    }
  }

  if (user.role === "lead") {
    items.push({
      id: "weekly-report",
      title: "Last week's pilot report is ready",
      body: "Answers used and follow-up time are both up on the week before.",
      href: "/reports",
      createdAt: minutesAgo(300),
    });
  }

  if (user.role === "admin") {
    const active = (title: string) =>
      db.document.count({ where: { title: { equals: title }, status: { equals: "active" } } });
    if (active("Pricing guide") > 1) {
      items.push({
        id: "outdated-pricing",
        title: "Two versions of the Pricing guide are active",
        body: "Reps can get answers from the older version. Deactivate it.",
        href: "/knowledge",
        createdAt: minutesAgo(240),
      });
    }
  }

  const withRead = items.map((n) => ({ ...n, read: seen.has(n.id) }));
  return NotificationList.parse({
    items: withRead,
    unread: withRead.filter((n) => !n.read).length,
  });
}

export const notificationHandlers = [
  route("get", "/notifications", { run: ({ user }) => notificationsFor(user) }),

  // Everything the user can see right now counts as read.
  route("post", "/notifications/read", {
    run: ({ user }) => {
      const seen = readNotifications.get(user.id) ?? new Set<string>();
      for (const item of notificationsFor(user).items) seen.add(item.id);
      readNotifications.set(user.id, seen);
    },
  }),
];
