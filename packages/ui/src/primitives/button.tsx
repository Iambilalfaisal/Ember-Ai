import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";

// Primary is neutral (coal). Glow is kept for warmth and live AI arrival, so it stays meaningful.
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-instant disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-coal text-paper hover:bg-coal/90",
        secondary: "border border-cinder bg-paper text-coal hover:bg-ash",
        ghost: "text-coal hover:bg-coal/8",
      },
      size: {
        sm: "h-8 px-3 text-detail",
        md: "h-9 px-4 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { ref?: Ref<HTMLButtonElement> };

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
