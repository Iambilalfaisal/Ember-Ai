// The mock backend. Only the provider that starts it may import from here (enforced by lint).

import { clearDb } from "./db";
import { seedWorld } from "./seed";

export { setMockLatency, isMockLatencyOn } from "./latency";
export { setNow } from "./clock";
export { startMockWorker } from "./browser";

/** Restores the demo world to its starting state. */
export function resetMockDb(company?: string): void {
  clearDb();
  seedWorld(company ? { company } : {});
}

let seeded = false;

/** Seeds the demo world once. Called before the worker starts. */
export function ensureMockDb(company?: string): void {
  if (seeded) return;
  seeded = true;
  resetMockDb(company);
}
