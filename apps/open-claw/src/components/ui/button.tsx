import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap',
    'transition-all duration-150 outline-none select-none',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-[0.97]',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-primary text-primary-foreground shadow-sm shadow-primary/25',
          'hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
        ],
        destructive: [
          'bg-destructive text-white shadow-sm shadow-destructive/25',
          'hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20',
          'focus-visible:ring-destructive/50',
          'dark:bg-destructive/80 dark:hover:bg-destructive/90',
        ],
        outline: [
          'border border-border bg-background text-foreground shadow-xs',
          'hover:bg-accent hover:text-accent-foreground hover:border-accent',
          'dark:border-input dark:bg-input/20 dark:hover:bg-input/40',
        ],
        secondary: ['bg-secondary text-secondary-foreground shadow-xs', 'hover:bg-secondary/70'],
        ghost: [
          'text-foreground/70',
          'hover:bg-accent hover:text-foreground',
          'dark:hover:bg-accent/50',
        ],
        link: [
          'text-primary underline-offset-4 p-0 h-auto shadow-none',
          'hover:underline hover:text-primary/80',
        ],
        success: [
          'bg-emerald-600 text-white shadow-sm shadow-emerald-500/25',
          'hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/20',
          'focus-visible:ring-emerald-500/50',
          'dark:bg-emerald-700 dark:hover:bg-emerald-600',
        ],
        warning: [
          'bg-amber-500 text-white shadow-sm shadow-amber-500/25',
          'hover:bg-amber-400 hover:shadow-md hover:shadow-amber-400/20',
          'focus-visible:ring-amber-500/50',
        ],
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5',
        lg: "h-11 rounded-xl px-6 text-base has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-5",
        xl: "h-12 rounded-xl px-8 text-base has-[>svg]:px-6 [&_svg:not([class*='size-'])]:size-5",
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': "size-11 rounded-xl [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled ?? loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
