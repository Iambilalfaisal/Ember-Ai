import {
  Dialog as DialogPrimitive,
  Popover as PopoverPrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

// Tooltip

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="ember-popover z-50 max-w-64 rounded-control bg-coal px-2.5 py-1.5 text-detail text-paper shadow-float"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// Popover

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          "ember-popover z-50 w-80 max-w-[calc(100vw-24px)] rounded-panel border border-cinder bg-paper p-4 text-sm shadow-float",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// Dialog and sheet

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="ember-overlay fixed inset-0 z-40 bg-nav/60 backdrop-blur-[2px]" />
  );
}

export function DialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "ember-dialog fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-sheet border border-cinder bg-paper p-6 shadow-float",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

/** A panel that slides in from the right edge. */
export function SheetContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "ember-sheet fixed inset-y-0 right-0 z-50 w-[min(28rem,100vw)] rounded-l-sheet border-l border-cinder bg-paper p-6 shadow-float",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
