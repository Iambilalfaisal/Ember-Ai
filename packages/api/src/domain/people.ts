import { z } from "zod";
import { ContactRole, ContactStatus, Role } from "./common";

export const User = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  email: z.string(),
  role: Role,
});
export type User = z.infer<typeof User>;

export const Contact = z.object({
  id: z.string(),
  dealId: z.string(),
  name: z.string(),
  title: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: ContactRole.default("other"),
  status: ContactStatus.default("active"),
});
export type Contact = z.infer<typeof Contact>;
