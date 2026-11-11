import { z } from "zod";
import { Role } from "./common";

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
});
export type Contact = z.infer<typeof Contact>;
