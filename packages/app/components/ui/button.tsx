import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-display text-xs font-semibold tracking-[0.02em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground btn-elegant-primary rounded-[var(--radius)]",
        destructive:
          "bg-loss text-loss-foreground btn-elegant-primary rounded-[var(--radius)]",
        outline:
          "btn-elegant-secondary rounded-[var(--radius)] text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground btn-elegant-secondary rounded-[var(--radius)]",
        ghost: "bg-transparent text-muted-foreground shadow-none hover:bg-[hsl(var(--foreground)/0.06)] hover:text-foreground rounded-[var(--radius)]",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "btn-liquid-glass rounded-[var(--radius)]",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-[11px]",
        lg: "h-12 px-8 text-[12px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
