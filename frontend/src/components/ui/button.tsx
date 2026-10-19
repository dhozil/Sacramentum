import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brass text-ink-950 hover:bg-brass-bright shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]",
        secondary: "bg-ink-800 text-parchment hover:bg-ink-700 border border-line",
        outline: "border border-line text-parchment hover:border-brass hover:text-brass-bright",
        ghost: "text-muted hover:text-parchment hover:bg-ink-800/70",
        danger: "bg-seal text-parchment hover:brightness-110",
        verdigris: "bg-verdigris text-ink-950 hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "h-9 w-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
