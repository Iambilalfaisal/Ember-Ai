"use client";

import { useEffect, useState } from "react";

/**
 * Streams text in word by word. With `enabled` false the whole text shows at once. Reduced motion keeps
 * the progressive reveal (the text still arrives as it is produced) but drops the ignite sweep.
 * Key the component by its text so a new answer starts from the beginning.
 */
export function StreamedText({
  text,
  enabled = true,
  wordsPerSecond = 18,
  onDone,
}: {
  text: string;
  enabled?: boolean;
  wordsPerSecond?: number;
  onDone?: () => void;
}) {
  const words = text.split(" ");
  const [count, setCount] = useState(0);
  const visible = enabled ? Math.min(count, words.length) : words.length;
  const done = visible >= words.length;

  useEffect(() => {
    if (!enabled || done) return;
    const id = setInterval(() => setCount((n) => n + 1), 1000 / wordsPerSecond);
    return () => clearInterval(id);
  }, [enabled, done, wordsPerSecond]);

  useEffect(() => {
    if (enabled && done) onDone?.();
  }, [enabled, done, onDone]);

  return (
    <>
      {/* Screen readers get the finished answer once, not every word as it arrives. */}
      <span aria-hidden="true">{words.slice(0, visible).join(" ")}</span>
      <span className="sr-only" role="status">
        {done ? text : ""}
      </span>
    </>
  );
}
