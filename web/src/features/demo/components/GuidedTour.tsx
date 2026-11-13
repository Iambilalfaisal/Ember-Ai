"use client";

import { isDemoMode, useMe } from "@ember/api";
import { Button } from "@ember/ui";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { useUi } from "@/lib/ui";

type Step = {
  title: string;
  /** What to do on this screen, in one or two sentences. */
  action: string;
  userId: "sam" | "priya" | "alex";
  href: string;
};

// The demo path, in the order a client sees it. Each step knows who to be and where to go, so Next
// moves the whole demo along and a presenter never has to remember the route.
export const TOUR_STEPS: readonly Step[] = [
  {
    title: "Start with My Day",
    action: "Sam's day shows four opportunities, each with a reason it needs attention.",
    userId: "sam",
    href: "/my-day",
  },
  {
    title: "Send a follow-up",
    action:
      "Open Meridian Robotics, read the notes, then view the draft and send it. The count drops.",
    userId: "sam",
    href: "/my-day",
  },
  {
    title: "Prepare for the call",
    action: "Today's Blue Harbor call has a brief and a plan. Start the call when you are ready.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/prep",
  },
  {
    title: "Take the call",
    action:
      "Answers arrive with their source. Watch for Not confirmed, the price objection and the contradiction.",
    userId: "sam",
    href: "/live/call-blue-harbor-live",
  },
  {
    title: "Review and approve",
    action:
      "End the call, then approve the summary. Tasks appear and the follow-up draft is ready.",
    userId: "sam",
    href: "/calls/call-blue-harbor-live/review",
  },
  {
    title: "Switch to the team lead",
    action: "Priya sees Blue Harbor back on track. Assign Nimbus Freight to Jules.",
    userId: "priya",
    href: "/team",
  },
  {
    title: "Revive an old opportunity",
    action:
      "Coastal Parcel has a suggested way back in. Fernbridge is left out, and the page says so.",
    userId: "priya",
    href: "/revival",
  },
  {
    title: "Move a deal",
    action: "Drag Blue Harbor to Proposal, then open it to see today's call on its timeline.",
    userId: "priya",
    href: "/pipeline",
  },
  {
    title: "Manage what answers come from",
    action: "Alex deactivates an outdated document, then asks the test console a question.",
    userId: "alex",
    href: "/knowledge",
  },
  {
    title: "See the trends",
    action: "Pilot metrics by week: answers used, accuracy, follow-up time and overdue work.",
    userId: "alex",
    href: "/reports",
  },
];

/** An optional, dismissible guide to the demo path. It never blocks the page behind it. */
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
    <aside
      aria-label="Guided tour"
      className="fixed bottom-4 left-64 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-cinder bg-paper p-4 shadow-float max-lg:left-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-detail text-smoke">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <Button variant="ghost" size="icon" aria-label="End tour" onClick={() => setStep(null)}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div role="status" className="-mt-2">
        <h2 className="text-sm font-semibold text-coal">{current.title}</h2>
        <p className="mt-1 text-sm text-coal">{current.action}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button size="sm" disabled={step === 0} onClick={() => goTo(step - 1)}>
          Back
        </Button>
        <div className="flex items-center gap-2">
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
  );
}
