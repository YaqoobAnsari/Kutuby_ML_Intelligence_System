import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tailwind variants for the badge primitive, including the locked outcome
 * taxonomy colors (`pass` / `fail` / `error`).
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-sm',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-sm',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        /** PASS = is_correct === true. */
        pass: 'border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:text-emerald-300',
        /** FAIL = is_correct === false. */
        fail: 'border-red-600/20 bg-red-500/10 text-red-700 dark:border-red-400/20 dark:text-red-300',
        /** ERROR = is_correct === null (API/network failure). */
        error:
          'border-amber-600/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:text-amber-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/** Props for the {@link Badge} primitive. */
export type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

/**
 * Small status pill. Use the `pass` / `fail` / `error` variants for the locked
 * outcome taxonomy.
 */
export function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
