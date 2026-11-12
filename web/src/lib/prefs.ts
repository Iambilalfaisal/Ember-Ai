import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PREFS_KEY } from "./theme-script";

export type ThemeChoice = "system" | "light" | "dark";

type PrefsState = {
  theme: ThemeChoice;
  navCollapsed: boolean;
  /** Demo only: wait 200 to 600 ms for each response, like a real backend. */
  latency: boolean;
  setTheme: (theme: ThemeChoice) => void;
  toggleNav: () => void;
  setLatency: (on: boolean) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "system",
      navCollapsed: false,
      latency: true,
      setTheme: (theme) => set({ theme }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setLatency: (latency) => set({ latency }),
    }),
    { name: PREFS_KEY, skipHydration: true },
  ),
);

/** Light and dark are set on <html>. "System" removes the attribute so the media query decides. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
