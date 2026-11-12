"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getApiMode } from "../mode";
import { ApiClientProvider } from "./ApiClientProvider";

/** Starts the mock backend in mock mode, then renders the app. */
export function ApiProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [ready, setReady] = useState(getApiMode() === "live");

  useEffect(() => {
    if (getApiMode() === "live") return;
    // Loaded on demand so live builds never ship the mock backend.
    void import("../mock").then(async ({ ensureMockDb, startMockWorker }) => {
      ensureMockDb();
      await startMockWorker();
      setReady(true);
    });
  }, []);

  if (!ready) return null;
  return <ApiClientProvider userId={userId}>{children}</ApiClientProvider>;
}
