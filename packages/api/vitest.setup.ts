import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { configureApi } from "./src/client";
import { setMockLatency } from "./src/mock";
import { resetMockDb } from "./src/mock";
import { createMockServer } from "./src/mock/node";

// Every test starts from the same demo world, with no artificial latency, as Sam unless it says otherwise.
const server = createMockServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  configureApi({ baseUrl: "http://localhost/api", getUserId: () => "sam" });
  setMockLatency(false);
  resetMockDb();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
