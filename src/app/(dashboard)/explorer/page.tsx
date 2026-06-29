import type { ReactElement } from 'react';
import { AttemptsTable } from '@/components/explorer/attempts-table';
import { ExplorerPagination } from '@/components/explorer/explorer-pagination';
import { FilterBar } from '@/components/explorer/filter-bar';
import { Card, CardContent, EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { listAttempts } from '@/lib/data/attempts';
import type { AttemptFilters, AttemptOutcome, AttemptType } from '@/types/domain';

/**
 * Dynamic: filtered reads of production rows happen at request time, never at
 * build, and a runtime failure degrades to an error state.
 */
export const dynamic = 'force-dynamic';

/** Rows per page for the explorer. */
const PAGE_SIZE = 50;

/** Read the first value of a (possibly repeated) search param. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Valid attempt-type filter values. */
const TYPES: readonly AttemptType[] = ['letter', 'word'];
/** Valid outcome filter values. */
const OUTCOMES: readonly AttemptOutcome[] = ['pass', 'fail', 'error'];

/** Parse URL search params into typed filters + the requested page. */
function parseParams(sp: Record<string, string | string[] | undefined>): {
  filters: AttemptFilters;
  page: number;
} {
  const typeRaw = first(sp.type);
  const outcomeRaw = first(sp.outcome);
  const q = first(sp.q)?.trim();
  const pageRaw = Number.parseInt(first(sp.page) ?? '1', 10);

  const filters: AttemptFilters = {
    attemptType: TYPES.includes(typeRaw as AttemptType)
      ? (typeRaw as AttemptType)
      : undefined,
    outcomes: OUTCOMES.includes(outcomeRaw as AttemptOutcome)
      ? [outcomeRaw as AttemptOutcome]
      : undefined,
    search: q && q.length > 0 ? q : undefined,
  };

  return {
    filters,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

/**
 * Dataset Explorer (Phase 2): a filterable, paginated table over every
 * pronunciation attempt. Each row expands to prediction, per-model scores,
 * latency, capture context, the recording, and the raw model/client JSON.
 */
export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { filters, page } = parseParams(await searchParams);

  try {
    const { rows, total, pageSize } = await listAttempts(filters, {
      page,
      pageSize: PAGE_SIZE,
    });

    return (
      <div className="space-y-6">
        <PageHeader
          title="Dataset Explorer"
          description="Every pronunciation attempt, filterable and inspectable. Expand a row for prediction, scores, latency, capture context, the recording, and raw model output."
        />

        <FilterBar />

        {rows.length === 0 ? (
          <EmptyState
            title="No attempts match these filters"
            description="Try widening the type or outcome — or clear the filters."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <AttemptsTable rows={rows} />
            </CardContent>
          </Card>
        )}

        <ExplorerPagination page={page} pageSize={pageSize} total={total} />
      </div>
    );
  } catch {
    return (
      <ErrorState
        title="Unable to load attempts"
        description="The dashboard data service is unavailable. Check the Supabase configuration and try again."
      />
    );
  }
}
