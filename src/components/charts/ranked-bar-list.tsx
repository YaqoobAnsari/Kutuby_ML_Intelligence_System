'use client';

import * as React from 'react';
import { BarList, type BarListItem } from '@/components/charts/bar-list';

/** Props for {@link RankedBarList}. */
export interface RankedBarListProps {
  /** Rows to render; order is preserved (pre-sort for ranking). */
  data: BarListItem[];
  /** Value formatting: integer count or percentage. */
  format?: 'count' | 'percent';
  /** Bar color — a theme chart var string. */
  color?: string;
  /** Chart height in pixels. */
  height?: number;
  /** Width reserved for category labels. */
  labelWidth?: number;
  /** Additional classes for the wrapper. */
  className?: string;
}

const COUNT_FORMAT = new Intl.NumberFormat('en-US');

/**
 * Server-friendly wrapper over {@link BarList}: takes a serializable `format`
 * string (not a function, which cannot cross the RSC boundary) and supplies the
 * matching value formatter on the client.
 */
export function RankedBarList({
  data,
  format = 'count',
  color,
  height,
  labelWidth,
  className,
}: RankedBarListProps): React.ReactElement {
  const valueFormatter =
    format === 'percent'
      ? (v: number): string => `${v.toFixed(0)}%`
      : (v: number): string => COUNT_FORMAT.format(v);

  return (
    <BarList
      data={data}
      color={color}
      height={height}
      labelWidth={labelWidth}
      className={className}
      valueFormatter={valueFormatter}
    />
  );
}
