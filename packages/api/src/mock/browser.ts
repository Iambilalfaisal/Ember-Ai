import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

let started: Promise<unknown> | null = null;

/** Starts the service worker that answers API calls in the browser. Safe to call more than once. */
export function startMockWorker(): Promise<unknown> {
  started ??= setupWorker(...handlers).start({
    onUnhandledFrame: "bypass",
    quiet: true,
  });
  return started;
}
