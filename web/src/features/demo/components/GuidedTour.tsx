"use client";

import { isDemoMode, useMe } from "@ember/api";
import { Button, cn } from "@ember/ui";
import { ChevronDown, Quote, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { useUi } from "@/lib/ui";

type Step = {
  /** The headline: what this part of the product does for the customer. */
  title: string;
  /** Why it matters, for the person watching. */
  value: string;
  /** What to do on this screen, in one or two sentences. */
  action: string;
  /** A line for the presenter to say out loud. Shown under "Presenter notes". */
  say: string;
  userId: "sam" | "priya" | "alex";
  href: string;
  /** The part of the screen to light up: the value of a data-tour attribute. */
  target: string;
  /** Which bottom corner the card sits in, so it stays off the lit area. */
  dock: "left" | "right";
};

// The demo story, in the order an investor sees it: focus, follow-up, preparation, the call, the
// summary, the manager, control and proof. Each step knows who to be and where to go, so Next moves
// the whole demo along and a presenter never has to remember the route.
export const TOUR_STEPS: readonly Step[] = [
  {
    title: "Start with focus",
    value:
      "A rep can hold dozens of leads. Ember hands Sam the four that need him today, each with the reason it is there.",
    action: "Look at the list: every row says why it is here and what to do next.",
    say: "Instead of a spreadsheet, the rep gets a ranked list with a reason for each lead. Nothing is forgotten.",
    userId: "sam",
    href: "/my-day",
    target: "my-day-list",
    dock: "right",
  },
  {
    title: "The follow-up is already written",
    value:
      "Ember drafts the reply from the notes of the last call, so a stalled lead is answered in a minute.",
    action:
      "Open Meridian Robotics, read the notes, then view the draft and send it. Watch the count drop.",
    say: "One click and the follow-up is out. The number in the sidebar goes down.",
    userId: "sam",
    href: "/my-day",
    target: "my-day-detail",
    dock: "left",
  },
  {
    title: "Prepared in seconds",
    value:
      "Before each call: where things stand, promises still owed, objections to expect and a plan.",
    action: "Read the brief, then press Start call when you are ready.",
    say: "This used to be thirty minutes of digging through emails and notes.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/prep",
    target: "brief",
    dock: "right",
  },
  {
    title: "Answers on the call, with proof",
    value:
      "Ember listens and answers technical questions from the company's own documents and shows the source. If the documents do not say, it shows Not confirmed instead of guessing.",
    action:
      "Watch the cards arrive: an answer with its source, Not confirmed, the price objection and a contradiction.",
    say: "No guessing and no “I’ll get back to you”. Every answer carries a source the client can check.",
    userId: "sam",
    href: "/live/call-blue-harbor-live",
    target: "live-panel",
    dock: "left",
  },
  {
    title: "Finished before they hang up",
    value: "The summary, the tasks and the follow-up are prepared as soon as the call ends.",
    action:
      "End the call, then approve the summary. Tasks appear and the follow-up draft is ready.",
    say: "The rep reviews instead of typing. The admin work drops from an hour to a minute.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/review",
    target: "review",
    dock: "right",
  },
  {
    title: "The manager sees risk early",
    value:
      "Team leads see stalled and unassigned opportunities with the reason, and fix them in one click.",
    action: "Priya sees Blue Harbor back on track. Assign Nimbus Freight to Jules.",
    say: "Managers stop finding out at the forecast meeting. They see it this morning.",
    userId: "priya",
    href: "/team",
    target: "team-table",
    dock: "right",
  },
  {
    title: "The company controls the AI",
    value:
      "Admins choose which documents answers may come from, switch off outdated ones and test questions before reps ever see them.",
    action: "Alex deactivates an outdated document, then asks the test console a question.",
    say: "This is what makes it safe to roll out: the AI can only say what the company approved.",
    userId: "alex",
    href: "/knowledge",
    target: "knowledge-docs",
    dock: "right",
  },
  {
    title: "Proof that it works",
    value:
      "Pilot metrics by week show how much reps use the answers, how accurate they are and how fast follow-ups go out.",
    action:
      "Point to answers used, answers correct and the time from call end to follow-up. These figures are sample data.",
    say: "This is how we prove the return in a pilot: adoption, accuracy and speed, week by week.",
    userId: "alex",
    href: "/reports",
    target: "report-metrics",
    dock: "right",
  },
];

type Box = { top: number; left: number; width: number; height: number };

/** Lights up one part of the page and dims the rest. It never blocks clicks on the page. */
function Spotlight({ target, step }: { target: string; step: number }) {
  const [box, setBox] = useState<Box | null>(null);
  const scrolled = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!el) {
        setBox((prev) => (prev === null ? prev : null));
        return;
      }
      if (scrolled.current !== step) {
        scrolled.current = step;
        el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      }
      const r = el.getBoundingClientRect();
      const pad = 8;
      const next = {
        top: Math.round(r.top - pad),
        left: Math.round(r.left - pad),
        width: Math.round(r.width + pad * 2),
        height: Math.round(r.height + pad * 2),
      };
      setBox((prev) =>
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    read();
    const timer = setInterval(read, 300);
    window.addEventListener("resize", read);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", read);
    };
  }, [target, step]);

  if (!box) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-20 rounded-panel ring-2 ring-iris transition-all duration-300 ease-out"
      style={{ ...box, boxShadow: "0 0 0 9999px rgb(10 8 40 / 0.5)" }}
    />
  );
}

/** A guided, dismissible walkthrough of the product story. It never blocks the page behind it. */
export function GuidedTour() {
  const step = useUi((s) => s.tourStep);
  const setStep = useUi((s) => s.setTourStep);
  const signIn = useSession((s) => s.signIn);
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (step === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStep(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setStep]);

  if (!isDemoMode() || step === null) return null;
  const current = TOUR_STEPS[step];
  if (!current) return null;

  const goTo = (index: number) => {
    const target = TOUR_STEPS[index];
    if (!target) return;
    setStep(index);
    if (me?.id !== target.userId) signIn(target.userId);
    router.push(target.href);
  };
  const last = step === TOUR_STEPS.length - 1;

  return (
    <>
      <Spotlight target={current.target} step={step} />
      <aside
        aria-label="Guided tour"
        className={cn(
          "fixed bottom-4 z-30 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-panel border border-cinder bg-paper shadow-float",
          current.dock === "right" ? "right-4" : "left-64 max-lg:left-4",
        )}
      >
        <div aria-hidden="true" className="flex gap-1 bg-iris-wash p-2">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-pill transition-ui",
                i <= step ? "bg-iris" : "bg-cinder",
              )}
            />
          ))}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-detail font-medium text-iris-ink">
              Step {step + 1} of {TOUR_STEPS.length}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2"
              aria-label="End tour"
              onClick={() => setStep(null)}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div role="status" className="-mt-2">
            <h2 className="text-base font-semibold text-coal">{current.title}</h2>
            <p className="mt-1 text-sm text-coal">{current.value}</p>
            <p className="mt-3 rounded-control bg-iris-wash px-3 py-2 text-sm text-coal">
              <span className="font-medium text-iris-ink">Try this: </span>
              {current.action}
            </p>
          </div>
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-detail text-smoke hover:text-iris-ink">
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-ui group-open:rotate-180"
              />
              Presenter notes
            </summary>
            <p className="mt-2 flex gap-2 text-sm text-coal">
              <Quote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-iris-ink" />
              {current.say}
            </p>
          </details>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button size="sm" disabled={step === 0} onClick={() => goTo(step - 1)}>
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => (last ? setStep(null) : goTo(step + 1))}
            >
              {last ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
