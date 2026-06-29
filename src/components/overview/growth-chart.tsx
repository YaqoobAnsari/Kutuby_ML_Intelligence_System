'use client';

import type { ReactElement } from 'react';
import { TimeSeriesChart } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { formatDateShort, formatNumber } from '@/lib/utils';
import type { DailyPoint } from '@/types/domain';

/** Props for {@link GrowthChart}. */
export interface GrowthChartProps {
  /** Daily aggregated attempts, bucketed on `recorded_at`. */
  data: DailyPoint[];
  /** Chart height in pixels (default 280). */
  height?: number;
  /** Extra class names. */
  className?: string;
}

/**
 * Daily practice-volume chart: total attempts per day over `recorded_at`
 * (behavioral time, not ingestion). Thin client wrapper around
 * {@link TimeSeriesChart}; empty-safe.
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
        description="Daily volume appears once attempts are recorded."
        className={className}
      />
    );
  }

  return (
    <TimeSeriesChart
      className={className}
      data={data}
      xKey="date"
      height={height}
      series={[
        {
          key: 'total',
          label: 'Attempts',
          color: 'hsl(var(--chart-1))',
          type: 'area',
        },
      ]}
      xTickFormatter={(value) => formatDateShort(value)}
      valueFormatter={(value) => formatNumber(value)}
    />
  );
}
