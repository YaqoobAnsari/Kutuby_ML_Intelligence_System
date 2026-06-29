import type { ReactElement } from 'react';
import { EmptyState } from '@/components/ui';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

/** Props for {@link CaptureHealth}. */
export interface CaptureHealthProps {
  /** Total attempts in scope (all rows, audio or not). */
  total: number;
  /** Attempts whose recording reached storage (audio_storage_path NOT NULL). */
  withAudio: number;
  /** Extra class names. */
  className?: string;
}

/**
 * Compact audio-capture health: the share of attempts whose recording reached
 * storage, shown as a percentage with a slim progress bar. This deliberately
 * distinguishes "attempts" from "attempts with audio" (a row can exist with a
 * NULL audio path when upload failed). Empty-safe.
 */
export function CaptureHealth({
  total,
  withAudio,
  className,
}: CaptureHealthProps): ReactElement {
  if (!total || total <= 0) {
    return (
      <EmptyState title="No attempts yet" className={cn('py-4', className)} />
    );
  }

  const rate = withAudio / total;
  const pct = Math.max(0, Math.min(100, rate * 100));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {formatPercent(rate)} captured
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(withAudio)} / {formatNumber(total)}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Audio capture rate"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
