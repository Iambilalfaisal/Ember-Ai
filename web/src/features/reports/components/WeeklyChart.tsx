"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

export type ChartSeries = { name: string; values: number[]; tone: "coal" | "smoke" };

const W = 480;
const H = 176;
const PAD = { top: 12, right: 44, bottom: 24, left: 36 };

/** Round the top of the scale up to a tidy number so the grid sits on 0, a half and the top. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

const stroke = (tone: ChartSeries["tone"]) => `var(--color-${tone})`;

/**
 * One measure by week. A line (or columns) from zero, three hairline gridlines, the latest value
 * labelled at the end, and a readout for any week on hover or with the arrow keys.
 */
export function WeeklyChart({
  title,
  unit,
  weeks,
  series,
  kind = "line",
  format,
  summary,
}: {
  title: string;
  /** What is plotted, shown under the title. */
  unit: string;
  weeks: string[];
  series: ChartSeries[];
  kind?: "line" | "bar";
  format: (value: number) => string;
  summary: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const count = weeks.length;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    kind === "bar"
      ? PAD.left + ((i + 0.5) / count) * innerW
      : PAD.left + (i / Math.max(count - 1, 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const barWidth = Math.min(24, (innerW / count) * 0.5);

  const indexAt = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const slot = kind === "bar" ? ratio * count - 0.5 : ratio * (count - 1);
    return Math.min(count - 1, Math.max(0, Math.round(slot)));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive((i) => Math.min(count - 1, (i ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive((i) => Math.max(0, (i ?? count) - 1));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <figure className="min-w-0">
      <figcaption>
        <h3 className="text-sm font-medium text-coal">{title}</h3>
        <p className="text-detail text-smoke">{unit}</p>
      </figcaption>
      {series.length > 1 ? (
        <ul className="mt-1 flex gap-4 text-detail text-coal" aria-label="Legend">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: stroke(s.tone) }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-roledescription="chart"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="w-full overflow-visible rounded-control"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-cinder)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--color-smoke)"
                fontSize={11}
              >
                {format(tick)}
              </text>
            </g>
          ))}
          {weeks.map((label, i) =>
            i === 0 || i === count - 1 || i === Math.floor(count / 2) ? (
              <text
                key={label}
                x={x(i)}
                y={H - 6}
                textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"}
                fill="var(--color-smoke)"
                fontSize={11}
              >
                {label}
              </text>
            ) : null,
          )}

          {active !== null && kind === "line" ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--color-smoke)"
              strokeWidth={1}
            />
          ) : null}

          {series.map((s) =>
            kind === "bar" ? (
              <g key={s.name}>
                {s.values.map((v, i) => (
                  <path
                    key={weeks[i]}
                    d={`M${x(i) - barWidth / 2},${y(0)} V${y(v) + 4} a4,4 0 0 1 4,-4 h${barWidth - 8} a4,4 0 0 1 4,4 V${y(0)} Z`}
                    fill={stroke(s.tone)}
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                ))}
              </g>
            ) : (
              <g key={s.name}>
                <polyline
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={stroke(s.tone)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {(() => {
                  const i = active ?? count - 1;
                  const v = s.values[i] ?? 0;
                  return (
                    <circle
                      cx={x(i)}
                      cy={y(v)}
                      r={4}
                      fill={stroke(s.tone)}
                      stroke="var(--color-paper)"
                      strokeWidth={2}
                    />
                  );
                })()}
              </g>
            ),
          )}

          {/* The latest value, labelled once at the end of each series. */}
          {active === null
            ? series.map((s) => {
                const last = s.values[count - 1] ?? 0;
                return (
                  <text
                    key={s.name}
                    x={kind === "bar" ? x(count - 1) : x(count - 1) + 10}
                    y={kind === "bar" ? y(last) - 6 : y(last)}
                    textAnchor={kind === "bar" ? "middle" : "start"}
                    dominantBaseline={kind === "bar" ? "auto" : "middle"}
                    fill="var(--color-coal)"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {format(last)}
                  </text>
                );
              })
            : null}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={(event) => setActive(indexAt(event))}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null ? (
          <div
            id={`${id}-tip`}
            role="status"
            className="pointer-events-none absolute top-0 z-10 rounded-control border border-cinder bg-paper px-2.5 py-1.5 text-detail shadow-float"
            style={{
              left: `${(x(active) / W) * 100}%`,
              transform: active > count / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <p className="text-smoke">Week of {weeks[active]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 text-coal">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ background: stroke(s.tone) }}
                />
                <span className="font-semibold">{format(s.values[active] ?? 0)}</span>
                {series.length > 1 ? <span className="text-smoke">{s.name}</span> : null}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
