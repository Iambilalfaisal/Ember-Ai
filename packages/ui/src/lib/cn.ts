import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// text-detail is our 13 px size. Without this, tailwind-merge reads it as a text colour and drops the
// real colour class next to it (text-paper text-detail loses text-paper).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["detail"] }] } },
});

/** Joins class names and resolves Tailwind conflicts, so a caller's className wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
