// Mock responses take a realistic 200 to 600 ms. The demo controls can switch it off.

let enabled = true;
let range: [number, number] = [200, 600];

export function setMockLatency(setting: boolean | { min: number; max: number }): void {
  if (typeof setting === "boolean") enabled = setting;
  else {
    enabled = true;
    range = [setting.min, setting.max];
  }
}

export function isMockLatencyOn(): boolean {
  return enabled;
}

export function latency(): Promise<void> {
  if (!enabled) return Promise.resolve();
  const [min, max] = range;
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
