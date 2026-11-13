"use client";

import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumn,
  Clock,
  Columns3,
  Contact,
  Gauge,
  Inbox,
  ListChecks,
  Phone,
  RotateCcw,
  ScanEye,
  Settings,
  ShieldCheck,
  Users,
  UserX,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useActiveIndex, useCountUp } from "./hooks";
import { BriefScene, CallScene, MyDayScene, ReviewScene, TeamScene } from "./scenes";

const delay = (i: number): CSSProperties => ({ ["--i" as string]: i });

function Reveal({
  as: Tag = "div",
  i = 0,
  className = "",
  children,
}: {
  as?: "div" | "li" | "p" | "h2";
  i?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag data-reveal="" className={className} style={delay(i)}>
      {children}
    </Tag>
  );
}

export function Marquee() {
  const items = [
    "Answers with sources",
    "Not confirmed instead of guessing",
    "Consent before listening",
    "Hidden from screen share",
    "Approved documents only",
    "Follow-ups ready in minutes",
    "Teams, Outlook and ClickUp",
  ];
  return (
    <div className="lp-marquee" aria-hidden="true">
      <div className="lp-marquee-track">
        {[...items, ...items].map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

const PROBLEMS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Hourglass,
    title: "Follow-ups slip",
    text: "Fifty leads per rep. The promise made on Tuesday is forgotten by Friday.",
  },
  {
    icon: UserX,
    title: "Answers wait for a callback",
    text: "A technical question mid-call becomes 'I will get back to you', and the deal cools.",
  },
  {
    icon: ScanEye,
    title: "Managers find out late",
    text: "Stalled deals surface at the forecast, when it is already too late to save them.",
  },
];

export function Problem() {
  return (
    <section className="lp-section" id="problem" aria-labelledby="lp-problem">
      <div className="lp-wrap">
        <Reveal as="h2" className="lp-h2 lp-center">
          <span id="lp-problem">
            Deals are not lost in the meeting.{" "}
            <span className="lp-fade">They are lost in the week after it.</span>
          </span>
        </Reveal>
        <ul className="lp-problems">
          {PROBLEMS.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" i={i} key={title} className="lp-problem lp-glow">
              <span className="lp-problem-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS: Array<{ kicker: string; title: string; text: string; scene: ReactNode }> = [
  {
    kicker: "Start the day",
    title: "Start with focus",
    text: "A short, ranked list of who needs you today. Each item says why, suggests the next step and already has the follow-up drafted.",
    scene: <MyDayScene />,
  },
  {
    kicker: "Before the call",
    title: "Walk in prepared",
    text: "Where the deal stands, what they asked, what you promised and which objections to expect. In seconds, not half an hour.",
    scene: <BriefScene />,
  },
  {
    kicker: "During the call",
    title: "Answer with proof",
    text: "Technical answers appear on the call with the source document and section. When the documents do not say, Ember says Not confirmed instead of guessing.",
    scene: <CallScene />,
  },
  {
    kicker: "After the call",
    title: "Finish before they hang up",
    text: "A draft summary to approve. Approving creates the tasks, updates the opportunity and prepares the follow-up.",
    scene: <ReviewScene />,
  },
  {
    kicker: "Across the team",
    title: "See risk early",
    text: "Leads see what is stalled or unowned, and why. They assign it in one click, before it shows up in the forecast.",
    scene: <TeamScene />,
  },
];

export function Story() {
  const { active, setActive, refs } = useActiveIndex(STEPS.length);
  return (
    <section className="lp-section" id="story" aria-labelledby="lp-story">
      <div className="lp-wrap">
        <Reveal as="h2" className="lp-h2 lp-center">
          <span id="lp-story">One working day, from the first task to the forecast</span>
        </Reveal>
        <p className="lp-sub lp-center">Follow a single deal through Ember.</p>
        <div className="lp-story">
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                ref={(node) => {
                  refs.current[i] = node;
                }}
                className="lp-step"
                data-active={active === i ? "true" : undefined}
              >
                <button type="button" className="lp-step-head" onClick={() => setActive(i)}>
                  <span className="lp-step-n">{i + 1}</span>
                  <span className="lp-step-kicker">{s.kicker}</span>
                </button>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="lp-step-scene" aria-hidden="true">
                  {s.scene}
                </div>
              </li>
            ))}
          </ol>
          <div className="lp-sticky" aria-hidden="true">
            <div className="lp-sticky-inner">
              <div className="lp-sticky-glow" />
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="lp-sticky-scene"
                  data-on={active === i ? "true" : "false"}
                >
                  {active === i ? s.scene : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MODULES: Array<{ icon: LucideIcon; title: string; text: string; wide?: boolean }> = [
  {
    icon: Inbox,
    title: "My Day",
    text: "One ranked page for the rep: who needs help, why, and the draft ready to send.",
    wide: true,
  },
  {
    icon: Phone,
    title: "Calls",
    text: "A brief before, sourced answers during, an approved summary and follow-up after.",
    wide: true,
  },
  {
    icon: Columns3,
    title: "Pipeline",
    text: "Opportunities by stage. Drag to move, read the timeline.",
  },
  { icon: Contact, title: "Contacts", text: "The people at each account, fed by your calls." },
  { icon: ListChecks, title: "Tasks", text: "Every follow-up with its owner and due date." },
  {
    icon: Users,
    title: "Team view",
    text: "Stalled and unowned deals, with the reason and a one-click fix.",
  },
  {
    icon: RotateCcw,
    title: "Revival queue",
    text: "Old deals with a reason to come back, and a polite way in.",
  },
  {
    icon: BookOpen,
    title: "Knowledge base",
    text: "The approved documents answers may come from, with a test console.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Reports",
    text: "Answers used, share correct and time to follow-up, week by week.",
  },
  {
    icon: Settings,
    title: "Settings",
    text: "Follow-up rules, consent, integrations, roles, AI usage and cost.",
  },
];

export function Modules() {
  return (
    <section className="lp-section" id="product" aria-labelledby="lp-modules">
      <div className="lp-wrap">
        <Reveal as="h2" className="lp-h2 lp-center">
          <span id="lp-modules">Everything a sales team needs, in one workspace</span>
        </Reveal>
        <p className="lp-sub lp-center">Ten areas, three roles, one source of truth.</p>
        <ul className="lp-bento">
          {MODULES.map(({ icon: Icon, title, text, wide }, i) => (
            <Reveal
              as="li"
              i={i % 4}
              key={title}
              className={`lp-tile lp-glow${wide ? " lp-tile-wide" : ""}`}
            >
              <span className="lp-tile-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stat({
  to,
  from,
  label,
  suffix,
}: {
  to: number;
  from?: number;
  label: string;
  suffix?: string;
}) {
  const { ref, value } = useCountUp(to, from);
  return (
    <div className="lp-stat">
      <span className="lp-stat-n">
        <span ref={ref}>{value}</span>
        {suffix}
      </span>
      <span className="lp-stat-l">{label}</span>
    </div>
  );
}

export function Proof() {
  return (
    <section className="lp-section lp-section-tight" aria-label="Ember in numbers">
      <div className="lp-wrap">
        <Reveal className="lp-stats">
          <Stat to={10} label="product areas, one workspace" />
          <Stat to={3} label="roles: rep, team lead, admin" />
          <Stat to={0} from={9} label="answers without a source or a Not confirmed" />
          <Stat to={5} label="minute guided tour of the live product" />
        </Reveal>
      </div>
    </section>
  );
}

const TRUST: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: BookOpen,
    title: "Approved documents only",
    text: "Answers come from the company's own documents. If they do not say, Ember says Not confirmed.",
  },
  {
    icon: ShieldCheck,
    title: "Consent first",
    text: "Recording consent is confirmed before Ember listens, and the panel is hidden from screen share.",
  },
  {
    icon: Settings,
    title: "Admins hold the controls",
    text: "Switch outdated documents off, test questions in a console, set roles and retention.",
  },
  {
    icon: Gauge,
    title: "Cost you can see",
    text: "AI usage and cost are visible to admins, so rolling it out to a team has no surprises.",
  },
];

export function Trust() {
  return (
    <section className="lp-section" id="trust" aria-labelledby="lp-trust">
      <div className="lp-wrap">
        <Reveal as="h2" className="lp-h2 lp-center">
          <span id="lp-trust">Built so a company can trust it on a customer call</span>
        </Reveal>
        <p className="lp-sub lp-center">
          Control and proof are part of the product, not an add-on.
        </p>
        <ul className="lp-trust">
          {TRUST.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" i={i} key={title} className="lp-trust-card lp-glow">
              <span className="lp-tile-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="lp-section" aria-labelledby="lp-final">
      <div className="lp-wrap">
        <Reveal className="lp-final">
          <span className="lp-ring lp-ring-a" aria-hidden="true" />
          <span className="lp-ring lp-ring-b" aria-hidden="true" />
          <span className="lp-ring lp-ring-c" aria-hidden="true" />
          <h2 id="lp-final" className="lp-h2">
            See Ember run a real sales call
          </h2>
          <p className="lp-sub">
            A five minute guided tour of the live product. Sample data, nothing is recorded.
          </p>
          <div className="lp-cta-row">
            <Link href="/sign-in" className="lp-btn lp-btn-primary lp-btn-lg">
              Start the live demo <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className="lp-fine">
            <Clock size={13} aria-hidden="true" /> Takes about five minutes. No account needed.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
