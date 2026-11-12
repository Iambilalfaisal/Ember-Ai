"use client";

import { ApiProvider, setDemoLatency } from "@ember/api";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { applyTheme, usePrefs } from "@/lib/prefs";
import { useSession } from "@/lib/session";

// Sonner reads these variables, so toasts use the same tokens (and themes) as the rest of the app.
const TOAST_STYLE = {
  "--normal-bg": "var(--ember-paper)",
  "--normal-text": "var(--ember-coal)",
  "--normal-border": "var(--ember-cinder)",
  fontFamily: "var(--font-sans)",
} as CSSProperties;

/** Loads what was saved in the browser, applies the theme, and starts the data layer. */
export function Providers({ children }: { children: ReactNode }) {
  const [restored, setRestored] = useState(false);
  const pathname = usePathname();
  const userId = useSession((s) => s.userId);
  const theme = usePrefs((s) => s.theme);
  const latency = usePrefs((s) => s.latency);

  useEffect(() => {
    void Promise.all([useSession.persist.rehydrate(), usePrefs.persist.rehydrate()]).then(() =>
      setRestored(true),
    );
  }, []);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    void setDemoLatency(latency);
  }, [latency]);

  // The style guide shows static examples and needs no data, so it renders at once and skips the
  // mock backend.
  if (pathname === "/design") return <>{children}</>;
  if (!restored) return null;
  return (
    // Signed out, the sign-in screen still needs the list of people, so it asks as the first rep.
    <ApiProvider userId={userId ?? "sam"}>
      {children}
      <Toaster position="bottom-right" closeButton style={TOAST_STYLE} />
    </ApiProvider>
  );
}
