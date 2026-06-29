'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
 * Sticky page header bar: current page context on the left and a (not-yet-wired)
 * date-range affordance on the right. Internal dashboard — no auth/identity.
 */
export function Topbar(): React.ReactElement {
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
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Global date-range filter ships with Dataset Explorer (Phase 2)"
          className="gap-2"
        >
          <CalendarRange className="h-4 w-4" />
          <span>Last 30 days</span>
        </Button>
      </div>
    </header>
  );
}
