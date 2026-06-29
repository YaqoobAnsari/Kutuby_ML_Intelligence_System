'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CHART_MARGIN,
  ChartContainer,
  chartAxisProps,
  chartColor,
  chartTooltipStyle,
  type ChartColorIndex,
} from '@/components/charts/chart-container';

/**
 * A single distribution bar. Kept intentionally generic (a pre-formatted label
 * plus a count) so callers can adapt domain bins — e.g. the metrics
 * `histogram()` `{ start, end, count }` output — into a display label.
 */
export interface HistogramBar {
  /** Pre-formatted bucket label (e.g. "0.8–0.9"). */
  label: string;
  /** Number of observations in this bucket. */
  count: number;
}

/** Props for {@link Histogram}. */
export interface HistogramProps {
  /** Ordered distribution bars (low → high). */
  data: HistogramBar[];
  /** Theme chart color index (`--chart-1..5`, default 1). */
  colorIndex?: ChartColorIndex;
  /** Chart height in pixels (default 280). */
  height?: number;
  /** Format an x-axis (bucket) tick. */
  xTickFormatter?: (value: string) => string;
  /** Format a y-axis (count) tick. */
  yTickFormatter?: (value: number) => string;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Distribution histogram rendered as vertical bars over ordered buckets, for
 * showing the shape of a metric (e.g. confidence or similarity distributions).
 */
export function Histogram({
  data,
  colorIndex = 1,
  height = 280,
  xTickFormatter,
  yTickFormatter,
  className,
}: HistogramProps): React.ReactElement {
  return (
    <ChartContainer height={height} className={className}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tickFormatter={
            xTickFormatter ? (value: string) => xTickFormatter(value) : undefined
          }
          interval="preserveStartEnd"
          {...chartAxisProps}
        />
        <YAxis
          width={40}
          allowDecimals={false}
          tickFormatter={
            yTickFormatter ? (value: number) => yTickFormatter(value) : undefined
          }
          {...chartAxisProps}
        />
        <Tooltip {...chartTooltipStyle} />
        <Bar dataKey="count" fill={chartColor(colorIndex)} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
