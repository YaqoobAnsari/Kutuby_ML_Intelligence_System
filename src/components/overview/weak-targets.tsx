'use client';

import type { ReactElement } from 'react';
import { BarList } from '@/components/charts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { TargetStat } from '@/types/domain';

/** Props for {@link WeakTargets}. */
export interface WeakTargetsProps {
  /** Panel title (e.g. "Weakest letters"). */
  title: string;
  /** Optional supporting description. */
  description?: string;
  /** Targets to rank by combined FAIL+ERROR rate. */
  data: TargetStat[];
  /** Maximum rows to render (default 8). */
  maxItems?: number;
  /** Extra class names for the card. */
  className?: string;
}

/**
 * Combined FAIL+ERROR rate for a target (operational misses plus model misses,
 * over all of its attempts); `null` when the target has no attempts.
 */
function failErrorRate(stat: TargetStat): number | null {
  if (!stat.total || stat.total <= 0) return null;
  return (stat.fail + stat.error) / stat.total;
}

/**
 * A titled panel ranking the weakest targets (letters or words) by their
 * combined FAIL+ERROR rate, with each row's attempt volume in the label and the
 * rate as the bar value. Group key is the canonical target; the glyph-aware
 * `label` is shown as-is. Empty-safe. Reused for both letters and words.
 */
export function WeakTargets({
  title,
  description,
  data,
  maxItems = 8,
  className,
}: WeakTargetsProps): ReactElement {
  const ranked = (data ?? [])
    .map((stat) => ({ stat, rate: failErrorRate(stat) }))
    .filter((row): row is { stat: TargetStat; rate: number } => row.rate !== null)
    .sort((a, b) => b.rate - a.rate || b.stat.total - a.stat.total)
    .slice(0, Math.max(0, maxItems));

  const items = ranked.map(({ stat, rate }) => ({
    name: `${stat.label} (${formatNumber(stat.total)})`,
    value: rate,
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="No targets yet"
            description="Targets appear once attempts are recorded."
          />
        ) : (
          <BarList data={items} valueFormatter={(value) => formatPercent(value)} />
        )}
      </CardContent>
    </Card>
  );
}
