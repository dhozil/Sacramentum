import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wider",
  {
    variants: {
      tone: {
        neutral: "border-line text-muted",
        brass: "border-brass/50 bg-brass/10 text-brass-bright",
        verdigris: "border-verdigris/50 bg-verdigris/10 text-verdigris",
        seal: "border-seal/60 bg-seal/12 text-seal",
        parchment: "border-parchment/30 bg-parchment/5 text-parchment",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
