'use client';

import type { ReactElement } from 'react';
import { TimeSeriesChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { formatDateShort, formatNumber } from '@/lib/utils';
import type { DailyPoint } from '@/types/domain';

/** Outcome series plotted per day (semantic colors: green/red/amber). */
const OUTCOME_SERIES = [
  { key: 'pass', label: 'Pass', color: 'hsl(142 71% 45%)' },
  { key: 'fail', label: 'Fail', color: 'hsl(0 72% 51%)' },
  { key: 'error', label: 'Error', color: 'hsl(38 92% 50%)' },
] as const;

/** Props for {@link GrowthChart}. */
export interface GrowthChartProps {
  /** Daily aggregated outcomes, bucketed on `recorded_at` (UTC). */
  data: DailyPoint[];
  /** Chart height in pixels (default 280). */
  height?: number;
  /** Extra class names. */
  className?: string;
}

/**
 * Daily outcomes chart: pass / fail / error per day stacked into one band, so
 * the stack height reads as total attempts while the colored bands show the
 * outcome split (hover reads out each). Bucketed on `recorded_at` (UTC).
 */
export function GrowthChart({
  data,
  height = 280,
  className,
}: GrowthChartProps): ReactElement {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Daily outcomes appear once attempts are recorded."
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        {OUTCOME_SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <TimeSeriesChart
        data={data}
        xKey="date"
        height={height}
        stacked
        series={OUTCOME_SERIES.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          type: 'area' as const,
        }))}
        xTickFormatter={(value) => formatDateShort(value)}
        valueFormatter={(value) => formatNumber(value)}
      />
    </div>
  );
}
