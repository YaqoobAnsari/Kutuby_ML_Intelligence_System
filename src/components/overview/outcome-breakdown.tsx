import type { ReactElement } from 'react';
import { EmptyState } from '@/components/ui';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type {
  AttemptOutcome,
  OutcomeBreakdown as OutcomeBreakdownData,
} from '@/types/domain';

/**
 * Visual styling per outcome, kept consistent across the bar and the legend.
 * Colors echo the badge taxonomy: PASS positive, FAIL destructive, ERROR
 * warning. ERROR is operational and is never folded into FAIL.
 */
const OUTCOME_META: Record<AttemptOutcome, { label: string; color: string }> = {
  pass: { label: 'Pass', color: 'bg-emerald-500' },
  fail: { label: 'Fail', color: 'bg-destructive' },
  error: { label: 'Error', color: 'bg-amber-500' },
};

/** Fixed display order. */
const OUTCOME_ORDER: readonly AttemptOutcome[] = ['pass', 'fail', 'error'];

/** Props for {@link OutcomeBreakdown}. */
export interface OutcomeBreakdownProps {
  /** Pass / fail / error counts with a total. */
  breakdown: OutcomeBreakdownData;
  /** Extra class names. */
  className?: string;
}

/**
 * A compact pass/fail/error display: one stacked bar sized by share plus a
 * legend with counts and rates over all attempts. Empty-safe.
 */
export function OutcomeBreakdown({
  breakdown,
  className,
}: OutcomeBreakdownProps): ReactElement {
  const counts: Record<AttemptOutcome, number> = {
    pass: breakdown.pass,
    fail: breakdown.fail,
    error: breakdown.error,
  };
  const total =
    breakdown.total > 0
      ? breakdown.total
      : counts.pass + counts.fail + counts.error;

  if (!total || total <= 0) {
    return (
      <EmptyState
        title="No outcomes yet"
        description="Outcomes appear once attempts are recorded."
        className={className}
      />
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label="Outcome distribution"
      >
        {OUTCOME_ORDER.map((outcome) => {
          const share = (counts[outcome] / total) * 100;
          if (share <= 0) return null;
          return (
            <div
              key={outcome}
              className={cn('h-full', OUTCOME_META[outcome].color)}
              style={{ width: `${share}%` }}
              title={`${OUTCOME_META[outcome].label}: ${formatPercent(
                counts[outcome] / total,
              )}`}
            />
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {OUTCOME_ORDER.map((outcome) => (
          <div key={outcome} className="space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  OUTCOME_META[outcome].color,
                )}
                aria-hidden
              />
              {OUTCOME_META[outcome].label}
            </dt>
            <dd className="text-sm font-semibold tabular-nums">
              {formatNumber(counts[outcome])}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {formatPercent(counts[outcome] / total)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
