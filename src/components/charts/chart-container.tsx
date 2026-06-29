'use client';

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

/** Index of a theme chart color (`--chart-1` … `--chart-5`). */
export type ChartColorIndex = 1 | 2 | 3 | 4 | 5;

/**
 * Resolve a theme chart color to an HSL string. Always use this (never a literal
 * color) so charts stay on the shared `--chart-1..5` palette in both themes.
 */
export function chartColor(index: ChartColorIndex): string {
  return `hsl(var(--chart-${index}))`;
}

/** Consistent inner margins applied to every chart. */
export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const;

/** Shared Recharts axis styling (theme-driven, subtle). */
export const chartAxisProps = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Shared Recharts `<Tooltip>` styling props that match the popover surface.
 * Spread onto a `<Tooltip {...chartTooltipStyle} />`.
 */
export const chartTooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)',
    boxShadow: '0 4px 16px hsl(var(--foreground) / 0.08)',
    fontSize: '12px',
    color: 'hsl(var(--popover-foreground))',
  },
  labelStyle: {
    color: 'hsl(var(--muted-foreground))',
    marginBottom: '0.25rem',
    fontWeight: 500,
  },
  itemStyle: { color: 'hsl(var(--popover-foreground))', padding: 0 },
  cursor: { fill: 'hsl(var(--muted) / 0.5)' },
} as const;

/** Props for {@link ChartContainer}. */
export interface ChartContainerProps {
  /** A single Recharts chart element (e.g. an `<AreaChart>`). */
  children: React.ReactElement;
  /** Fixed pixel height of the chart area (default 280). */
  height?: number;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Responsive sizing wrapper around Recharts' `ResponsiveContainer` with a fixed
 * height. Pass a single chart element as the child.
 */
export function ChartContainer({
  children,
  height = 280,
  className,
}: ChartContainerProps): React.ReactElement {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
