import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-pill border border-smoke bg-ash transition-instant data-[state=checked]:border-iris data-[state=checked]:bg-iris",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-pill bg-smoke transition-ui data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-iris-fg" />
    </SwitchPrimitive.Root>
  );
}
