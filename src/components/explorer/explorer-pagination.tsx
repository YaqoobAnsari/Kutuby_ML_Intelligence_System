'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Props for {@link ExplorerPagination}. */
export interface ExplorerPaginationProps {
  /** 1-based current page. */
  page: number;
  /** Rows per page. */
  pageSize: number;
  /** Total matching rows across all pages. */
  total: number;
}

/**
 * Offset pagination that preserves the active filters in the URL. Renders the
 * current window ("X–Y of N") plus previous/next controls.
 */
export function ExplorerPagination({
  page,
  pageSize,
  total,
}: ExplorerPaginationProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const goTo = (next: number): void => {
    const sp = new URLSearchParams(params.toString());
    if (next <= 1) sp.delete('page');
    else sp.set('page', String(next));
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={current <= 1}
          onClick={() => goTo(current - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {current} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={current >= totalPages}
          onClick={() => goTo(current + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
