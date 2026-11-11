"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { configureApi } from "../client";
import { getApiBaseUrl, getApiMode } from "../mode";

type Props = {
  /** The signed-in user. In the demo the role switcher changes this. */
  userId: string;
  children: ReactNode;
};

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, retry: false, refetchOnWindowFocus: false } },
  });
}

/** Configures the client, starts the mock backend in mock mode, then renders the app. */
export function ApiProvider({ userId, children }: Props) {
  const [client] = useState(makeClient);
  const [ready, setReady] = useState(getApiMode() === "live");

  configureApi({ baseUrl: getApiBaseUrl(), getUserId: () => userId });

  useEffect(() => {
    if (getApiMode() === "live") return;
    // Loaded on demand so live builds never ship the mock backend.
    void import("../mock").then(async ({ ensureMockDb, startMockWorker }) => {
      ensureMockDb();
      await startMockWorker();
      setReady(true);
    });
  }, []);

  // Switching user changes what every query returns, so drop the cache.
  useEffect(() => {
    void client.invalidateQueries();
  }, [client, userId]);

  if (!ready) return null;
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
