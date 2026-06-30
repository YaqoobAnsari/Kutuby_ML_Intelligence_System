'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { RefreshButton } from '@/components/layout/refresh-button';

/** Props for the {@link Topbar}. */
export interface TopbarProps {
  /** ISO timestamp of when the server last rendered this view (data freshness). */
  updatedAt: string;
}

/** Maps each section route prefix to a human-readable page-context label. */
const SECTION_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/explorer', 'Dataset Explorer'],
  ['/model-intelligence', 'Model Intelligence'],
  ['/quality', 'Dataset Quality'],
  ['/infrastructure', 'Storage & Infra'],
  ['/curation', 'Data Curation'],
];

/** Resolve the page-context label for the current pathname. */
function sectionLabel(pathname: string): string {
  const match = SECTION_LABELS.find(
    ([href]) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return match ? match[1] : 'Overview';
}

/**
 * Sticky page header bar: current page context on the left; a data-freshness
 * timestamp and a manual refresh on the right. Internal dashboard — no auth.
 */
export function Topbar({ updatedAt }: TopbarProps): React.ReactElement {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Dashboard
        </span>
        <span className="text-muted-foreground/50">/</span>
        <span className="truncate text-sm font-semibold">
          {sectionLabel(pathname)}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Updated {updatedAt.slice(11, 16)} UTC
        </span>
        <RefreshButton />
      </div>
    </header>
  );
}
