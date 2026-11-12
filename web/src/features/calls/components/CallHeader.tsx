import type { Call } from "@ember/api";
import { dateTime, plural } from "@/lib/format";

export function CallHeader({ call }: { call: Call }) {
  return (
    <header>
      <h2 className="text-lg font-semibold text-coal">{call.title}</h2>
      <p className="text-sm text-smoke">
        {call.company}, {dateTime(call.startsAt)}, {plural(call.durationMin, "minute")}
      </p>
      <ul aria-label="Participants" className="mt-2 flex flex-wrap gap-2">
        {call.participants.map((p) => (
          <li
            key={p.name}
            className="rounded-pill border border-cinder bg-paper px-2.5 py-0.5 text-detail text-coal"
          >
            {p.name}, {p.role}
          </li>
        ))}
      </ul>
    </header>
  );
}
