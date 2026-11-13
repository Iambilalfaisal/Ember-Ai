"use client";

import { isDemoMode, useCalls, useResetDemo } from "@ember/api";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  buttonVariants,
  cn,
} from "@ember/ui";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { usePrefs } from "@/lib/prefs";
import { useUi } from "@/lib/ui";

/** Demo only: reset the world, jump to the scripted call, and slow responses down or not. */
export function DemoControls() {
  const [open, setOpen] = useState(false);
  const reset = useResetDemo();
  const { data: calls } = useCalls();
  const collapsed = usePrefs((s) => s.navCollapsed);
  const latency = usePrefs((s) => s.latency);
  const setLatency = usePrefs((s) => s.setLatency);
  const scenarioCall = calls?.find((c) => c.scenarioId);
  const setTourStep = useUi((s) => s.setTourStep);

  if (!isDemoMode()) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {(() => {
        const trigger = (
          <button
            type="button"
            aria-label="Demo controls"
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-control px-2.5 text-sm text-nav-muted transition-instant hover:bg-nav-hover hover:text-nav-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <FlaskConical aria-hidden="true" className="size-[18px] shrink-0" />
            {collapsed ? null : <span>Demo controls</span>}
          </button>
        );
        return (
          <PopoverTrigger asChild>
            {collapsed ? (
              <Tooltip content="Demo controls" side="right">
                {trigger}
              </Tooltip>
            ) : (
              trigger
            )}
          </PopoverTrigger>
        );
      })()}
      <PopoverContent side="right" align="end" className="w-72">
        <h2 className="text-sm font-semibold">Demo controls</h2>
        <p className="mt-1 text-detail text-smoke">
          These only exist in the demo. The real product has none of them.
        </p>

        <div className="mt-4 space-y-3">
          <Button
            className="w-full"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => {
                  toast("Demo reset to its starting point.");
                  setOpen(false);
                },
              })
            }
          >
            Reset demo
          </Button>

          <Button
            className="w-full"
            onClick={() => {
              setTourStep(0);
              setOpen(false);
            }}
          >
            Start the guided tour
          </Button>

          {scenarioCall ? (
            <Link
              href={`/live/${scenarioCall.id}`}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
            >
              Play the live call scenario
            </Link>
          ) : null}

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Simulate response time
              <span className="block text-detail text-smoke">Each answer takes 200 to 600 ms.</span>
            </span>
            <Switch
              checked={latency}
              onCheckedChange={setLatency}
              aria-label="Simulate response time"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
