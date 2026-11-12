"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { configureApi } from "../client";
import { getApiBaseUrl } from "../mode";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, retry: false, refetchOnWindowFocus: false } },
  });
}

/**
 * Points the client at the backend and provides the query cache. It does not start the mock, so
 * tests can pair it with a mock server of their own.
 */
export function ApiClientProvider({
  userId,
  baseUrl = getApiBaseUrl(),
  children,
}: {
  userId: string;
  baseUrl?: string;
  children: ReactNode;
}) {
  const [client] = useState(makeClient);

  configureApi({ baseUrl, getUserId: () => userId });

  // A different user sees different data everywhere. Resetting (not just refreshing) means no screen
  // shows the previous person's data while the new data loads.
  useEffect(() => {
    void client.resetQueries();
  }, [client, userId]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
