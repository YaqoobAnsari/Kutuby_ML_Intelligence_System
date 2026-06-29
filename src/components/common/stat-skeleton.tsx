import * as React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Props for {@link StatSkeleton}. */
export interface StatSkeletonProps {
  /** Number of stat cards to render (default 1). */
  count?: number;
  /** Additional classes for each card. */
  className?: string;
}

/**
 * Loading placeholder shaped like a KPI / stat card (label + large value),
 * rendered `count` times so it can stand in for a row of metrics.
 */
export function StatSkeleton({
  count = 1,
  className,
}: StatSkeletonProps): React.ReactElement {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className={cn(className)} aria-hidden="true">
          <CardHeader className="pb-2">
            <Skeleton className="h-3.5 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
