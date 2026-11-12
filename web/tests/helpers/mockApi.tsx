import { ApiClientProvider } from "@ember/api";
import { resetMockDb } from "@ember/api/mock";
import { createMockServer } from "@ember/api/mock/node";
import { setMockLatency } from "@ember/api/mock";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { useSession } from "@/lib/session";

// Starts the mock backend for a test file: every test begins from the same demo world, with no delay.
export function setupMockBackend() {
  const server = createMockServer();
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  beforeEach(() => {
    setMockLatency(false);
    resetMockDb();
    useSession.setState({ userId: null });
  });
  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });
  afterAll(() => server.close());
}

export function Api({ userId, children }: { userId: string; children: ReactNode }) {
  return (
    <ApiClientProvider userId={userId} baseUrl="http://localhost/api">
      {children}
    </ApiClientProvider>
  );
}
