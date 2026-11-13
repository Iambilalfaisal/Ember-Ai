import {
  Check,
  CircleAlert,
  CornerDownRight,
  FileText,
  Flame,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

// Small, hand-built pictures of the real screens. They are decoration for the landing page:
// the product itself is one click away. The wording matches the demo workspace.

type Tone = "iris" | "amber" | "green" | "red" | "plain";

function Chip({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`lp-chip lp-chip-${tone}`}>{children}</span>;
}

function Window({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="lp-win">
      <div className="lp-win-bar">
        <span className="lp-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-win-title">{title}</span>
        <span className="lp-win-right">{right}</span>
      </div>
      <div className="lp-win-body">{children}</div>
    </div>
  );
}

const stagger = (i: number): CSSProperties => ({ ["--i" as string]: i });

/** The live call: questions arrive, answers appear with their source. Loops by itself. */
export function CallScene() {
  return (
    <Window
      title="Live call · Blue Harbor Logistics"
      right={
        <span className="lp-listening">
          <span className="lp-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          Listening
        </span>
      }
    >
      <div className="lp-call">
        <div className="lp-call-talk">
          <p className="lp-say lp-seq lp-seq-a">
            <b>Tom Reyes</b>
            How long does integration take with SAP?
          </p>
          <p className="lp-say lp-seq lp-seq-c">
            <b>Tom Reyes</b>
            Your competitor quoted us less. Why pay more?
          </p>
          <p className="lp-say lp-seq lp-seq-e">
            <b>Tom Reyes</b>
            Do you support single sign-on on the legacy plan?
          </p>
        </div>
        <div className="lp-call-cards">
          <div className="lp-card lp-card-answer lp-seq lp-seq-b">
            <span className="lp-card-kicker">
              <Sparkles size={13} aria-hidden="true" /> Answer
            </span>
            <p>Integration runs in three phases over six to eight weeks, with the ERP connector.</p>
            <Chip tone="iris">
              <FileText size={12} aria-hidden="true" /> Integration guide v3, section 2
            </Chip>
          </div>
          <div className="lp-card lp-card-flag lp-seq lp-seq-d">
            <span className="lp-card-kicker">
              <CircleAlert size={13} aria-hidden="true" /> Price objection
            </span>
            <p>Anchor on the weeks of integration time they save, not the licence price.</p>
          </div>
          <div className="lp-card lp-card-unsure lp-seq lp-seq-f">
            <span className="lp-card-kicker">
              <ShieldCheck size={13} aria-hidden="true" /> Not confirmed
            </span>
            <p>The documents do not say. Check with the team before promising.</p>
          </div>
        </div>
      </div>
    </Window>
  );
}

export function MyDayScene() {
  const rows: Array<[string, string, ReactNode, Tone]> = [
    [
      "Meridian Robotics",
      "Priya asked for ROI evidence. No next action since.",
      "Share the ROI case study",
      "amber",
    ],
    [
      "Solvex Manufacturing",
      "Proposal sent 8 days ago, no reply.",
      "Ask whether legal has questions",
      "red",
    ],
    [
      "Blue Harbor Logistics",
      "Tom asked about the integration timeline.",
      "Send the integration timeline",
      "iris",
    ],
  ];
  return (
    <Window title="My Day" right={<Chip tone="plain">3 need you</Chip>}>
      <ul className="lp-list">
        {rows.map(([company, why, next, tone], i) => (
          <li key={company} className="lp-row lp-pop" style={stagger(i)}>
            <span className={`lp-bar lp-bar-${tone}`} aria-hidden="true" />
            <div>
              <strong>{company}</strong>
              <span>{why}</span>
              <span className="lp-next">
                <CornerDownRight size={13} aria-hidden="true" /> {next}
              </span>
            </div>
            <Chip tone="green">Draft ready</Chip>
          </li>
        ))}
      </ul>
    </Window>
  );
}

export function BriefScene() {
  const blocks: Array<[string, ReactNode]> = [
    ["Where things stand", "Qualified. Intro call done, integration timeline still open."],
    ["They asked", "How long does SAP integration take? Who owns security review?"],
    ["We promised", "Send the integration timeline. Due today."],
    ["Expect", "Price against a cheaper competitor. Have the time-saved story ready."],
  ];
  return (
    <Window title="Brief · Blue Harbor Logistics" right={<Chip tone="iris">Ready in seconds</Chip>}>
      <div className="lp-brief">
        {blocks.map(([title, text], i) => (
          <div key={title} className="lp-brief-block lp-pop" style={stagger(i)}>
            <h4>{title}</h4>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </Window>
  );
}

export function ReviewScene() {
  const done = [
    "3 tasks created",
    "Blue Harbor moved to Proposal",
    "Follow-up draft ready to send",
  ];
  return (
    <Window title="Call review · Blue Harbor Logistics" right={<Chip tone="amber">Draft</Chip>}>
      <div className="lp-review">
        <p className="lp-review-text lp-pop" style={stagger(0)}>
          Tom confirmed the six to eight week timeline and asked for the security questionnaire.
          Price was raised once and answered with the time-saved story. Next step: send the timeline
          and questionnaire today.
        </p>
        <button type="button" tabIndex={-1} className="lp-approve lp-pop" style={stagger(1)}>
          <Check size={14} aria-hidden="true" /> Approve summary
        </button>
        <ul className="lp-done">
          {done.map((text, i) => (
            <li key={text} className={`lp-done-${i + 1}`}>
              <Check size={14} aria-hidden="true" /> {text}
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

export function TeamScene() {
  const rows: Array<[string, string, string, Tone]> = [
    ["Blue Harbor Logistics", "Qualified", "On track", "green"],
    ["Solvex Manufacturing", "Proposal", "Needs attention", "amber"],
    ["Meridian Robotics", "Discovery", "Needs attention", "amber"],
  ];
  return (
    <Window title="Team view" right={<Chip tone="plain">Priya Nair · Team lead</Chip>}>
      <ul className="lp-list">
        {rows.map(([company, stage, status, tone], i) => (
          <li key={company} className="lp-row lp-pop" style={stagger(i)}>
            <span className={`lp-bar lp-bar-${tone}`} aria-hidden="true" />
            <div>
              <strong>{company}</strong>
              <span>{stage}</span>
            </div>
            <Chip tone={tone}>{status}</Chip>
          </li>
        ))}
        <li className="lp-row lp-pop" style={stagger(3)}>
          <span className="lp-bar lp-bar-plain" aria-hidden="true" />
          <div>
            <strong>Nimbus Freight</strong>
            <span>Nobody owns this yet. It came in 3 days ago.</span>
          </div>
          <span className="lp-assign">
            <span className="lp-assign-from">Assign</span>
            <span className="lp-assign-to">
              <UserRound size={12} aria-hidden="true" /> Jules
            </span>
          </span>
        </li>
      </ul>
    </Window>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="lp-logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Flame size={Math.round(size * 0.58)} />
    </span>
  );
}
