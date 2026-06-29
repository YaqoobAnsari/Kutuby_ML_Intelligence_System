import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for the {@link Loading} spinner. */
export interface LoadingProps {
  /** Optional label rendered beside the spinner (also used as a11y text). */
  label?: string;
  /** Pixel size of the spinner icon (default 20). */
  size?: number;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Inline spinner with an optional label, for pending/loading regions.
 */
export function Loading({
  label = 'Loading…',
  size = 20,
  className,
}: LoadingProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="animate-spin" style={{ width: size, height: size }} />
      <span>{label}</span>
    </div>
  );
}
