"use client";

import type { Participant } from "@ember/api";
import { Button, cn } from "@ember/ui";
import { Mic, MicOff, MonitorUp, Video, VideoOff } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";

function Tile({ name, role, you }: { name: string; role: string; you?: boolean }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("");
  return (
    <figure className="flex aspect-video flex-1 flex-col items-center justify-center gap-2 rounded-panel border border-cinder bg-paper">
      <Avatar initials={initials} className="size-14 text-base" />
      <figcaption className="text-center">
        <p className="text-sm font-medium text-coal">{you ? `${name} (you)` : name}</p>
        <p className="text-detail text-smoke">{role}</p>
      </figcaption>
    </figure>
  );
}

function Toggle({
  on,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  onToggle,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  OnIcon: typeof Mic;
  OffIcon: typeof Mic;
  onToggle: () => void;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label={on ? onLabel : offLabel}
      aria-pressed={!on}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" className="size-4" />
    </Button>
  );
}

/** A stand-in for the video call window. The controls only change how they look. */
export function CallStage({
  participants,
  onEnd,
  ending,
  className,
}: {
  participants: Participant[];
  onEnd: () => void;
  ending: boolean;
  className?: string;
}) {
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [sharing, setSharing] = useState(false);
  const client = participants.filter((p) => p.side === "client");
  const rep = participants.find((p) => p.side === "rep");

  return (
    <section aria-label="Call stage" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="grid flex-1 content-center gap-4 sm:grid-cols-3">
        {client.slice(0, 2).map((p) => (
          <Tile key={p.name} name={p.name} role={p.role} />
        ))}
        {rep ? <Tile name={rep.name} role={rep.role} you /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Toggle
          on={mic}
          onLabel="Mute microphone"
          offLabel="Unmute microphone"
          OnIcon={Mic}
          OffIcon={MicOff}
          onToggle={() => setMic((v) => !v)}
        />
        <Toggle
          on={camera}
          onLabel="Turn camera off"
          offLabel="Turn camera on"
          OnIcon={Video}
          OffIcon={VideoOff}
          onToggle={() => setCamera((v) => !v)}
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label={sharing ? "Stop sharing screen" : "Share screen"}
          aria-pressed={sharing}
          onClick={() => setSharing((v) => !v)}
        >
          <MonitorUp aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="primary" onClick={onEnd} disabled={ending}>
          End call
        </Button>
      </div>
    </section>
  );
}
