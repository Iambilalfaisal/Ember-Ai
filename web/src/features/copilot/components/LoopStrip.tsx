import { cn } from "@ember/ui";
import { Brain, Eye, Lightbulb, ShieldCheck, Sprout, type LucideIcon } from "lucide-react";
import { plural } from "@/lib/format";

type StepProps = { Icon: LucideIcon; title: string; line: string; emphasis?: boolean };

function Step({ Icon, title, line, emphasis = false }: StepProps) {
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-1 gap-3 rounded-panel border p-3",
        emphasis ? "border-iris bg-iris-wash" : "border-cinder bg-paper",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control",
          emphasis ? "bg-iris text-iris-fg" : "bg-ash text-iris-ink",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-coal">{title}</span>
        <span className="block text-detail text-smoke">{line}</span>
      </span>
    </li>
  );
}

/** The copilot loop, with this person's numbers on it. The approval step is the one that is lit. */
export function LoopStrip({
  needYou,
  noNextAction,
  waiting,
  changesToday,
}: {
  needYou: number;
  noNextAction: number;
  waiting: number;
  changesToday: number;
}) {
  return (
    <section aria-label="How Ember works" data-tour="copilot-loop">
      <ol className="flex flex-col gap-2 lg:flex-row">
        <Step Icon={Eye} title="Reads" line="Deals, contacts and the timeline" />
        <Step
          Icon={Brain}
          title="Notices"
          line={`${plural(needYou, "deal")} need you, ${noNextAction} without a next action`}
        />
        <Step Icon={Lightbulb} title="Suggests" line={`${waiting} waiting for your decision`} />
        <Step
          Icon={ShieldCheck}
          title="You approve"
          line="Nothing changes until you say so"
          emphasis
        />
        <Step
          Icon={Sprout}
          title="Learns"
          line={`${plural(changesToday, "change")} logged today`}
        />
      </ol>
    </section>
  );
}
