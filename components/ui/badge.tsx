import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "rounded-sm px-2 py-0.5 bg-primary text-primary-foreground [a&]:hover:opacity-85",
        secondary:
          "rounded-sm px-2 py-0.5 bg-secondary text-secondary-foreground [a&]:hover:opacity-90",
        destructive:
          "rounded-sm px-2 py-0.5 bg-destructive text-white [a&]:hover:opacity-85",
        outline:
          "rounded-sm px-2 py-0.5 border-border text-foreground [a&]:hover:bg-secondary",
        ghost:
          "rounded-sm px-2 py-0.5 [a&]:hover:bg-secondary",
        link:
          "rounded-sm px-2 py-0.5 text-primary underline-offset-4 [a&]:hover:underline",
        // Cuaderno stamps — uppercase mono with slight rotation
        stamp:
          "rounded-none px-2.5 py-1 border-[1.5px] border-accent text-accent bg-transparent font-mono font-medium tracking-[0.20em] text-[11px] uppercase -rotate-[1.5deg]",
        "stamp-fill":
          "rounded-none px-2.5 py-1 border-[1.5px] border-accent bg-accent text-paper font-mono font-medium tracking-[0.20em] text-[11px] uppercase -rotate-[1.5deg]",
        "stamp-ink":
          "rounded-none px-2.5 py-1 border-[1.5px] border-foreground text-foreground bg-transparent font-mono font-medium tracking-[0.20em] text-[11px] uppercase -rotate-[1.5deg]",
        "stamp-outline":
          "rounded-none px-2.5 py-1 border border-ink-soft text-ink-soft bg-transparent font-mono font-medium tracking-[0.20em] text-[11px] uppercase -rotate-[1.5deg]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
