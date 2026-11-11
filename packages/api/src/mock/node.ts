import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** A request-intercepting server for tests (Node and jsdom). */
export function createMockServer() {
  return setupServer(...handlers);
}
