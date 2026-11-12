import { handlers } from "./handlers";

let started: Promise<unknown> | null = null;

/**
 * Starts the service worker that answers API calls in the browser. msw/browser has no server build,
 * so it is imported only behind a browser check, which the bundler removes from the server bundle.
 */
export function startMockWorker(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve();
  started ??= import("msw/browser").then(({ setupWorker }) =>
    setupWorker(...handlers).start({ onUnhandledFrame: "bypass", quiet: true }),
  );
  return started;
}
