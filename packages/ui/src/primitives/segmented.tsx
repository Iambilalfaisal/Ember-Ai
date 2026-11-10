import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

/** A single-choice group such as Light, Dark and System. Arrow keys move between options. */
export function Segmented<T extends string>({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix reports an empty string when the active item is pressed again; keep the choice.
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn("inline-flex rounded-control border border-cinder bg-paper p-0.5", className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="h-7 rounded-[4px] px-3 text-detail font-medium text-smoke transition-instant hover:text-coal data-[state=on]:bg-coal data-[state=on]:text-paper"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
