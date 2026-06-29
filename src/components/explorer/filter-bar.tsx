'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Shared styling for the native select controls (matches the Input primitive). */
const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Client filter bar for the Dataset Explorer. Filters live entirely in the URL
 * (shareable/bookmarkable); changing any control resets to page 1 and pushes a
 * new query, which the server page reads to re-query.
 */
export function FilterBar(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = React.useState(params.get('q') ?? '');
  React.useEffect(() => {
    setSearch(params.get('q') ?? '');
  }, [params]);

  const update = React.useCallback(
    (next: Record<string, string | undefined>): void => {
      const sp = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value && value.length > 0) sp.set(key, value);
        else sp.delete(key);
      }
      sp.delete('page'); // any filter change returns to the first page
      router.push(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  const type = params.get('type') ?? '';
  const outcome = params.get('outcome') ?? '';
  const hasFilters = type !== '' || outcome !== '' || (params.get('q') ?? '') !== '';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label="Attempt type"
        className={SELECT_CLASS}
        value={type}
        onChange={(e) => update({ type: e.target.value || undefined })}
      >
        <option value="">All types</option>
        <option value="letter">Letters</option>
        <option value="word">Words</option>
      </select>

      <select
        aria-label="Outcome"
        className={SELECT_CLASS}
        value={outcome}
        onChange={(e) => update({ outcome: e.target.value || undefined })}
      >
        <option value="">All outcomes</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
        <option value="error">Error</option>
      </select>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: search.trim() || undefined });
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search target or session…"
            className="h-9 w-64 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>

      {hasFilters && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push(pathname)}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
