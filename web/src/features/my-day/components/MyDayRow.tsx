import type { MyDayItem } from "@ember/api";
import { HeatIndicator, StatusPill, cn } from "@ember/ui";
import { CornerDownRight } from "lucide-react";
import { overdueLabel } from "../copy";

export function MyDayRow({
  item,
  selected,
  onSelect,
}: {
  item: MyDayItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 border-l-[3px] px-4 py-4 text-left transition-instant hover:bg-iris-wash/60",
        selected ? "border-iris bg-iris-wash" : "border-transparent",
      )}
    >
      <HeatIndicator heat={item.deal.heat} className="mt-1" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-base font-semibold text-coal">{item.deal.company}</span>
          {item.overdueDays > 0 ? (
            <StatusPill tone="overdue" className="shrink-0">
              {overdueLabel(item.overdueDays)}
            </StatusPill>
          ) : (
            <span className="shrink-0 text-detail text-smoke">{overdueLabel(0)}</span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-smoke">{item.reason}</span>
        <span className="mt-2 flex items-center gap-1.5 text-sm font-medium text-iris-ink">
          <CornerDownRight aria-hidden="true" className="size-4 shrink-0" />
          {item.suggestedAction}
        </span>
      </span>
    </button>
  );
}
