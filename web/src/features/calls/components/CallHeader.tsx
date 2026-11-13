import type { Call } from "@ember/api";
import { Aura, Rise } from "@ember/ui";
import { dateTime, plural } from "@/lib/format";

export function CallHeader({ call }: { call: Call }) {
  return (
    <Rise
      as="header"
      className="relative overflow-hidden rounded-panel border border-cinder bg-hero p-5 shadow-card"
    >
      <Aura />
      <div className="relative">
        <h2 className="text-lg font-semibold text-coal">{call.title}</h2>
        <p className="text-sm text-smoke">
          {call.company}, {dateTime(call.startsAt)}, {plural(call.durationMin, "minute")}
        </p>
        <ul aria-label="Participants" className="mt-2 flex flex-wrap gap-2">
          {call.participants.map((p) => (
            <li
              key={p.name}
              className="rounded-pill border border-iris/20 bg-paper px-2.5 py-0.5 text-detail text-coal"
            >
              {p.name}, {p.role}
            </li>
          ))}
        </ul>
      </div>
    </Rise>
  );
}
