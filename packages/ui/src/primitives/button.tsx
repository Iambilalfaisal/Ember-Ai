import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/cn";

// Primary is the iris accent. Glow is kept for warmth and live AI arrival, so it stays meaningful.
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-ui active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-iris text-iris-fg shadow-card hover:-translate-y-px hover:bg-iris-ink hover:shadow-lift",
        secondary:
          "border border-cinder bg-paper text-coal shadow-card hover:border-iris/50 hover:bg-iris-wash",
        ghost: "text-coal hover:bg-iris-wash hover:text-iris-ink",
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
