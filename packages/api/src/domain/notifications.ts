import { z } from "zod";
import { isoDate } from "./common";

export const Notification = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  /** The page the notification opens. */
  href: z.string(),
  createdAt: isoDate,
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationList = z.object({
  items: z.array(Notification),
  unread: z.number().int(),
});
export type NotificationList = z.infer<typeof NotificationList>;
