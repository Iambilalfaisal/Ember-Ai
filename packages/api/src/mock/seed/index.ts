import { clearDb, resetCounter } from "../db";
import { getNow } from "../clock";
import { seedCalls } from "./calls";
import { seedKnowledge } from "./knowledge";
import {
  seedAttention,
  seedInteractionsAndTasks,
  seedPeopleAndDeals,
  type SeedContext,
} from "./people";
import { seedReports } from "./reports";

export type SeedOptions = { company?: string; now?: Date };

/**
 * Builds the demo world: one consistent story, the same every time. Faker is seeded, and every date is
 * relative to "now", so the demo always reads as today.
 */
export function seedWorld(options: SeedOptions = {}): void {
  const ctx: SeedContext = {
    now: options.now ?? getNow(),
    company: options.company ?? "Northwind Solutions",
  };
  clearDb();
  resetCounter();
  seedPeopleAndDeals(ctx);
  seedAttention(ctx);
  seedInteractionsAndTasks(ctx);
  seedCalls(ctx);
  seedKnowledge(ctx);
  seedReports(ctx);
}

export { DOCUMENTS } from "./knowledge";
