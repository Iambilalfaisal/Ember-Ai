import { Fragment } from "react";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The original notes with the phrases Ember picked out marked, so the rep sees why a field says what it says. */
export function HighlightedText({ text, phrases }: { text: string; phrases: string[] }) {
  const usable = phrases.filter(Boolean);
  if (usable.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${usable.map(escape).join("|")})`, "gi");
  const lower = usable.map((p) => p.toLowerCase());
  return (
    <>
      {text.split(pattern).map((part, index) =>
        lower.includes(part.toLowerCase()) ? (
          <mark key={index} className="rounded-[3px] bg-cinder px-0.5 font-medium text-coal">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
