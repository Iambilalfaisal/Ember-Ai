import type { Interaction } from "@ember/api";
import { ArrowRightLeft, Mail, NotebookPen, Phone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { dateTime } from "@/lib/format";

const ICON: Record<Interaction["type"], { Icon: LucideIcon; label: string }> = {
  call: { Icon: Phone, label: "Call" },
  email: { Icon: Mail, label: "Email" },
  note: { Icon: NotebookPen, label: "Note" },
  stage_change: { Icon: ArrowRightLeft, label: "Stage change" },
};

/** What happened on an opportunity, newest first. */
export function Timeline({ interactions }: { interactions: Interaction[] }) {
  return (
    <ol
      aria-label="Activity"
      className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card"
    >
      {interactions.map((item) => {
        const { Icon, label } = ICON[item.type];
        return (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-smoke" />
            <div className="min-w-0 flex-1">
              <p className="text-detail text-smoke">
                {label}, {dateTime(item.at)}
              </p>
              <p className="max-w-[72ch] text-sm text-coal">{item.summary}</p>
            </div>
            {item.callId ? (
              <Link
                href={`/calls/${item.callId}`}
                className="shrink-0 text-detail text-smoke underline-offset-2 hover:text-coal hover:underline"
              >
                Open call
              </Link>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
