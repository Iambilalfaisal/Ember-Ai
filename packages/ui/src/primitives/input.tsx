import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const field =
  "w-full rounded-control border border-smoke bg-paper px-3 text-sm text-coal placeholder:text-smoke transition-instant hover:border-iris focus-visible:border-iris focus-visible:shadow-[0_0_0_3px_var(--ember-iris-wash)] disabled:opacity-50";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input className={cn(field, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea className={cn(field, "min-h-24 py-2 leading-normal", className)} {...props} />;
}
