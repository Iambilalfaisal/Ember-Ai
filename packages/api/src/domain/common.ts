import { z } from "zod";

// Shared building blocks of the draft API contract. Dates are ISO 8601 strings in UTC.

export const isoDate = z.iso.datetime();

export const roles = ["rep", "lead", "admin"] as const;
export const Role = z.enum(roles);
export type Role = z.infer<typeof Role>;

export const stages = ["discovery", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export const Stage = z.enum(stages);
export type Stage = z.infer<typeof Stage>;

/** Deal temperature: warm is active, cooling needs attention, cold is stalled. */
export const heats = ["warm", "cooling", "cold"] as const;
export const Heat = z.enum(heats);
export type Heat = z.infer<typeof Heat>;

export const dealStatuses = [
  "on_track",
  "needs_attention",
  "stalled",
  "unassigned",
  "revival",
  "declined",
] as const;
export const DealStatus = z.enum(dealStatuses);
export type DealStatus = z.infer<typeof DealStatus>;

/** Every error response has this shape. */
export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
