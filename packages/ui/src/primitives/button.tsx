import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";

// Buttons are pills with the brand gradient, matching the landing page. Glow is kept for warmth
// and live AI arrival, so it stays meaningful.
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill font-semibold transition-ui active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-iris-fg shadow-lift hover:-translate-y-px hover:shadow-float hover:brightness-110",
        secondary:
          "border border-cinder bg-paper text-coal shadow-card hover:-translate-y-px hover:border-iris/50 hover:bg-iris-wash hover:shadow-lift",
        ghost: "text-coal hover:bg-iris-wash hover:text-iris-ink",
      },
      size: {
        sm: "h-8 px-3.5 text-detail",
        md: "h-10 px-5 text-sm",
        icon: "size-10",
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
