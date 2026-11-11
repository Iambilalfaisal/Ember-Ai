// The mock backend's clock. Seed dates are relative to "now", so the demo always reads as today.

let override: Date | null = null;

export function getNow(): Date {
  return override ? new Date(override) : new Date();
}

/** For tests: freeze the clock. Pass null to follow the real clock again. */
export function setNow(date: Date | null): void {
  override = date;
}
