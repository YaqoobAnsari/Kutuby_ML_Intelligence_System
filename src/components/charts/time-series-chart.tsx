'use client';

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_MARGIN,
  ChartContainer,
  chartAxisProps,
  chartTooltipStyle,
} from '@/components/charts/chart-container';

/** Configuration for a single plotted series. */
export interface TimeSeriesSeries<T> {
  /** Key in each datum holding the numeric value to plot. */
  key: Extract<keyof T, string>;
  /** Human-readable label shown in the tooltip. */
  label: string;
  /** Stroke/fill color — pass a theme chart var, e.g. `hsl(var(--chart-1))`. */
  color: string;
  /** Render this series as a filled area (default) or a plain line. */
  type?: 'area' | 'line';
}

/** Props for {@link TimeSeriesChart}. */
export interface TimeSeriesChartProps<T extends object> {
  /** Ordered data points (typically one per day). */
  data: T[];
  /** Key in each datum holding the x-axis (date) value. */
  xKey: Extract<keyof T, string>;
  /** One or more series to plot. */
  series: ReadonlyArray<TimeSeriesSeries<T>>;
  /** Chart height in pixels (default 280). */
  height?: number;
  /** Format an x-axis tick (e.g. shorten an ISO date). */
  xTickFormatter?: (value: string) => string;
  /** Format a y-axis tick and tooltip value. */
  valueFormatter?: (value: number) => string;
  /** Stack area series into a cumulative band (stack height = total). */
  stacked?: boolean;
  /** Additional classes for the wrapper. */
  className?: string;
}

/** Coerce a Recharts tooltip value (which may be an array) to a number. */
function toNumber(value: number | string | Array<number | string>): number {
  return Array.isArray(value) ? Number(value[0]) : Number(value);
}

/**
 * Time-series chart (area and/or line) over a date field, supporting one or
 * more series with per-series type. Colors are supplied by the caller and
 * should reference the shared chart palette (`--chart-1..5`).
 */
export function TimeSeriesChart<T extends object>({
  data,
  xKey,
  series,
  height = 280,
  xTickFormatter,
  valueFormatter,
  stacked = false,
  className,
}: TimeSeriesChartProps<T>): React.ReactElement {
  // Stable, collision-free gradient id prefix for this chart instance.
  const gradientId = React.useId().replace(/:/g, '');

  // Axis/grid/tooltip provided as a keyed array (not a Fragment) so Recharts
  // reliably detects them.
  const commonChildren: React.ReactNode[] = [
    <CartesianGrid
      key="grid"
      strokeDasharray="3 3"
      stroke="hsl(var(--border))"
      vertical={false}
    />,
    <XAxis
      key="x"
      dataKey={xKey}
      tickFormatter={
        xTickFormatter ? (value: string) => xTickFormatter(value) : undefined
      }
      minTickGap={24}
      {...chartAxisProps}
    />,
    <YAxis
      key="y"
      width={40}
      tickFormatter={
        valueFormatter ? (value: number) => valueFormatter(value) : undefined
      }
      {...chartAxisProps}
    />,
    <Tooltip
      key="tooltip"
      {...chartTooltipStyle}
      formatter={
        valueFormatter
          ? (value: number | string | Array<number | string>): string =>
              valueFormatter(toNumber(value))
          : undefined
      }
    />,
  ];

  return (
    <ChartContainer height={height} className={className}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <defs>
          {series
            .filter((s) => (s.type ?? 'area') === 'area')
            .map((s) => (
              <linearGradient
                key={s.key}
                id={`${gradientId}-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
        </defs>
        {commonChildren}
        {series.map((s) =>
          (s.type ?? 'area') === 'line' ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={stacked ? s.color : `url(#${gradientId}-${s.key})`}
              fillOpacity={stacked ? 0.7 : 1}
              stackId={stacked ? 'stack' : undefined}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
