import { useState } from "react";

/** The time when the screen first drew. Held in state so a render never reads the clock twice. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
