"use client";

import { Segmented } from "@ember/ui";
import { useEffect, useState } from "react";
import { Attention } from "./sections/Attention";
import { Controls } from "./sections/Controls";
import { Foundations } from "./sections/Foundations";
import { LiveCall } from "./sections/LiveCall";
import { Working } from "./sections/Working";

type ThemeChoice = "system" | "light" | "dark";
type MotionChoice = "normal" | "reduced";

const index = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shape and depth"],
  ["motion", "Motion"],
  ["controls", "Controls"],
  ["attention", "Attention"],
  ["live-call", "Live call"],
  ["working", "Extracted details"],
  ["numbers", "Numbers"],
  ["states", "Empty and error"],
] as const;

export function DesignScreen() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [motion, setMotion] = useState<MotionChoice>("normal");

  // The choice is applied to <html>, where the tokens and motion rules read it.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (motion === "reduced") root.setAttribute("data-motion", "reduce");
    else root.removeAttribute("data-motion");
    return () => root.removeAttribute("data-motion");
  }, [motion]);

  return (
    <div className="min-h-screen bg-ash text-coal">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-cinder bg-paper px-6">
        <h1 className="text-lg">Ember design system</h1>
        <div className="flex items-center gap-4">
          <Segmented
            label="Theme"
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <Segmented
            label="Motion"
            value={motion}
            onValueChange={setMotion}
            options={[
              { value: "normal", label: "Normal motion" },
              { value: "reduced", label: "Reduced motion" },
            ]}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1200px] gap-10 px-6 py-8">
        <nav
          aria-label="On this page"
          className="sticky top-24 hidden h-fit w-48 shrink-0 lg:block"
        >
          <ul className="space-y-1">
            {index.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-control px-2 py-1 text-sm text-smoke transition-instant hover:text-coal"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          <Foundations />
          <Controls />
          <Attention />
          <LiveCall />
          <Working />
        </main>
      </div>
    </div>
  );
}
