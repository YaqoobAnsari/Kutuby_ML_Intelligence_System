'use client';

import * as React from 'react';
import { Bar, BarChart, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  chartColor,
  chartTooltipStyle,
} from '@/components/charts/chart-container';

/** A single ranked row in a {@link BarList}. */
export interface BarListItem {
  /** Category label shown on the y-axis. */
  name: string;
  /** Numeric magnitude of the bar. */
  value: number;
}

/** Props for {@link BarList}. */
export interface BarListProps {
  /** Rows to render; render order is preserved (pre-sort for ranking). */
  data: BarListItem[];
  /** Bar color — pass a theme chart var; defaults to `hsl(var(--chart-5))`. */
  color?: string;
  /** Chart height in pixels (default 280). */
  height?: number;
  /** Width reserved for category labels (default 120). */
  labelWidth?: number;
  /** Format the numeric value shown in the tooltip. */
  valueFormatter?: (value: number) => string;
  /** Additional classes for the wrapper. */
  className?: string;
}

/** Coerce a Recharts tooltip value (which may be an array) to a number. */
function toNumber(value: number | string | Array<number | string>): number {
  return Array.isArray(value) ? Number(value[0]) : Number(value);
}

/**
 * Horizontal ranked bar chart (e.g. weakest targets). Bars are drawn in the
 * order supplied — sort the data beforehand to rank them.
 */
export function BarList({
  data,
  color,
  height = 280,
  labelWidth = 120,
  valueFormatter,
  className,
}: BarListProps): React.ReactElement {
  return (
    <ChartContainer height={height} className={className}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          {...chartTooltipStyle}
          formatter={
            valueFormatter
              ? (value: number | string | Array<number | string>): string =>
                  valueFormatter(toNumber(value))
              : undefined
          }
        />
        <Bar
          dataKey="value"
          fill={color ?? chartColor(5)}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ChartContainer>
  );
}
