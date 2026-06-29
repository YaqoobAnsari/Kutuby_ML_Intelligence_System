import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Optional trend annotation rendered beside a KPI value. */
export interface KpiDelta {
  /** Pre-formatted delta text (e.g. "+12%"). */
  label: string;
  /** Visual trend direction (drives the accent color). */
  trend?: 'up' | 'down' | 'neutral';
}

/** Props for {@link KpiCard}. */
export interface KpiCardProps {
  /** Short metric title (e.g. "Total attempts"). */
  title: string;
  /** Primary value, already formatted (pass an em dash for unknowns). */
  value: string | number;
  /** Optional clarifying line beneath the value (e.g. the denominator). */
  subtext?: string;
  /** Optional trend annotation shown next to the value. */
  delta?: KpiDelta;
  /** Optional leading icon (a `lucide-react` component). */
  icon?: LucideIcon;
  /** Optional extra content rendered under the value (e.g. a small viz). */
  children?: ReactNode;
  /** Extra class names for the card. */
  className?: string;
}

/** Accent color per trend direction. */
const TREND_CLASS: Record<NonNullable<KpiDelta['trend']>, string> = {
  up: 'text-emerald-600',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/**
 * A compact, typographic KPI card: title, prominent value, optional delta,
 * subtext, leading icon, and an optional inline viz via `children`.
 */
export function KpiCard({
  title,
  value,
  subtext,
  delta,
  icon: Icon,
  children,
  className,
}: KpiCardProps): ReactElement {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon ? (
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              TREND_CLASS[delta.trend ?? 'neutral'],
            )}
          >
            {delta.label}
          </span>
        ) : null}
      </div>
      {subtext ? (
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
