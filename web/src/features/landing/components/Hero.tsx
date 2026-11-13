"use client";

import { ArrowRight, Check, Play } from "lucide-react";
import Link from "next/link";
import { useRef, type PointerEvent } from "react";
import { prefersReducedMotion } from "./hooks";
import { CallScene } from "./scenes";

// Fixed positions, so the server and the browser draw the same embers.
const EMBERS = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 47 + 13) % 100,
  size: 2 + ((i * 7) % 4),
  duration: 9 + ((i * 5) % 9),
  delay: -((i * 3) % 13),
  drift: ((i * 29) % 56) - 28,
}));

const WORDS = ["promise", "question", "follow-up", "objection"];

export function Hero() {
  const stage = useRef<HTMLDivElement | null>(null);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const node = stage.current;
    if (!node || prefersReducedMotion()) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
    node.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
  };
  const settle = () => {
    stage.current?.style.setProperty("--ry", "0deg");
    stage.current?.style.setProperty("--rx", "0deg");
  };

  return (
    <section className="lp-hero" data-glow aria-labelledby="lp-title">
      <div className="lp-aurora" aria-hidden="true">
        <span className="lp-blob lp-blob-a" />
        <span className="lp-blob lp-blob-b" />
        <span className="lp-blob lp-blob-c" />
        <span className="lp-grid" />
        <span className="lp-spot" />
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="lp-ember"
            style={{
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              animationDuration: `${e.duration}s`,
              animationDelay: `${e.delay}s`,
              ["--drift" as string]: `${e.drift}px`,
            }}
          />
        ))}
      </div>

      <div className="lp-wrap lp-hero-copy">
        <p className="lp-badge lp-rise" style={{ ["--i" as string]: 0 }}>
          <span className="lp-pulse-dot" aria-hidden="true" /> The AI sales copilot
        </p>
        <h1 id="lp-title" className="lp-h1 lp-rise" style={{ ["--i" as string]: 1 }}>
          The teammate that <span className="lp-shine">never lets a lead go quiet</span>
        </h1>
        <p className="lp-remember lp-rise" style={{ ["--i" as string]: 2 }}>
          Ember remembers every{" "}
          <span className="lp-words" aria-hidden="true">
            {WORDS.map((w, i) => (
              <span key={w} style={{ animationDelay: `${i * 2.5}s` }}>
                {w}
              </span>
            ))}
          </span>
          <span className="sr-only">promise, question and follow-up.</span>
        </p>
        <p className="lp-lede lp-rise" style={{ ["--i" as string]: 2 }}>
          It answers technical questions on the call with a source, and has the follow-up ready
          before the customer hangs up.
        </p>
        <div className="lp-cta-row lp-rise" style={{ ["--i" as string]: 3 }}>
          <Link href="/sign-in" className="lp-btn lp-btn-primary">
            Try the live demo <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <a href="#story" className="lp-btn lp-btn-ghost">
            <Play size={14} aria-hidden="true" /> See how it works
          </a>
        </div>
        <ul className="lp-proofs lp-rise" style={{ ["--i" as string]: 4 }}>
          {["Every answer cites its source", "Consent built in", "Controlled by your admins"].map(
            (t) => (
              <li key={t}>
                <Check size={14} aria-hidden="true" /> {t}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="lp-wrap lp-stage-wrap">
        <div
          className="lp-stage lp-rise"
          style={{ ["--i" as string]: 5 }}
          ref={stage}
          onPointerMove={tilt}
          onPointerLeave={settle}
          role="img"
          aria-label="Ember during a live call: the customer asks a question, and an answer appears with its source document. Price objections are flagged, and unknown answers are marked Not confirmed."
        >
          <div className="lp-stage-glow" aria-hidden="true" />
          <div className="lp-stage-tilt">
            <CallScene />
            <span className="lp-float lp-float-a" aria-hidden="true">
              <Check size={13} /> Follow-up drafted
            </span>
            <span className="lp-float lp-float-b" aria-hidden="true">
              <Check size={13} /> 3 tasks created
            </span>
            <span className="lp-float lp-float-c" aria-hidden="true">
              <Check size={13} /> Blue Harbor back on track
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
