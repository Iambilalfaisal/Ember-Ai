import { getApiMode } from "./mode";

// Controls for the demo only. In live mode there is no mock, so they do nothing.

/** Turns the simulated 200 to 600 ms response delay on or off. */
export async function setDemoLatency(on: boolean): Promise<void> {
  if (getApiMode() !== "mock") return;
  const { setMockLatency } = await import("./mock");
  setMockLatency(on);
}

/** True while the app runs on mock data, which is when the demo controls apply. */
export const isDemoMode = (): boolean => getApiMode() === "mock";
