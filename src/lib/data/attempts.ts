import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { RawAttemptRowSchema, toAttempt } from '@/lib/schemas/attempt';
import { TABLE } from '@/types/database';
import type {
  Attempt,
  AttemptFilters,
  AttemptOutcome,
  Paginated,
} from '@/types/domain';

/** Default page size when the caller does not specify one. */
const DEFAULT_PAGE_SIZE = 50;

/** Hard cap on page size to bound per-request payloads. */
const MAX_PAGE_SIZE = 100;

/**
 * Source for raw-row reads: the production table directly (no aggregation views
 * required). The `dash_attempt_flat` view remains an optional read-time
 * optimization once migrations are applied.
 */
const ATTEMPTS_VIEW = TABLE;

/**
 * Typed error raised by the attempts data layer (query failure or missing
 * configuration surfaced by the service client). Pages catch this and render a
 * graceful error state.
 */
export class DashboardDataError extends Error {
  /** Discriminant name for cross-boundary checks. */
  public readonly name = 'DashboardDataError';

  /**
   * @param message - Human-readable reason.
   * @param cause - Optional underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Offset-pagination parameters (page is 1-based; pageSize is clamped to 100). */
export interface PaginationParams {
  /** 1-based page number (defaults to 1). */
  page?: number;
  /** Rows per page (defaults to 50, clamped to <= 100). */
  pageSize?: number;
}

/** Clamp a number into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Build a PostgREST `or=` expression for an outcome filter against `is_correct`.
 * Returns `null` when the filter is a no-op (empty, or all three outcomes).
 */
function outcomeOrExpression(outcomes: readonly AttemptOutcome[]): string | null {
  const set = new Set(outcomes);
  if (set.size === 0 || set.size === 3) return null;
  const parts: string[] = [];
  if (set.has('pass')) parts.push('is_correct.is.true');
  if (set.has('fail')) parts.push('is_correct.is.false');
  if (set.has('error')) parts.push('is_correct.is.null');
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Sanitize a free-text search term for safe inclusion in a PostgREST `or=`
 * `ilike` expression (strips delimiter/wildcard characters that would break the
 * grammar) and wraps it for a contains match.
 */
function searchOrExpression(search: string): string | null {
  const term = search.replace(/[,%()*]/g, ' ').trim();
  if (term.length === 0) return null;
  const pattern = `%${term}%`;
  return [
    `target_sent_to_api.ilike.${pattern}`,
    `target_display.ilike.${pattern}`,
    `session_id.ilike.${pattern}`,
  ].join(',');
}

/**
 * List raw attempt rows for the Dataset Explorer, filtered and paginated.
 *
 * Filters: date range on `recorded_at`, `attempt_type`, `target_sent_to_api`,
 * `childId`, outcome (mapped to `is_correct` true/false/null), and free-text
 * search over target/session. Offset pagination, ordered `recorded_at desc`,
 * page size capped at 100. Dynamic (never cached).
 *
 * @param filters - Shared, URL-syncable filter state.
 * @param pagination - Optional offset-pagination parameters.
 * @returns A page of {@link Attempt} rows plus pagination metadata.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function listAttempts(
  filters: AttemptFilters,
  pagination?: PaginationParams,
): Promise<Paginated<Attempt>> {
  noStore();

  const pageSize = clamp(
    pagination?.pageSize ?? DEFAULT_PAGE_SIZE,
    1,
    MAX_PAGE_SIZE,
  );
  const page = Math.max(1, Math.trunc(pagination?.page ?? 1));
  const fromIndex = (page - 1) * pageSize;

  const supabase = createServiceClient();
  let query = supabase.from(ATTEMPTS_VIEW).select('*', { count: 'exact' });

  if (filters.from) query = query.gte('recorded_at', filters.from);
  if (filters.to) query = query.lte('recorded_at', filters.to);
  if (filters.attemptType) query = query.eq('attempt_type', filters.attemptType);
  if (filters.target) query = query.eq('target_sent_to_api', filters.target);
  if (filters.childId) query = query.eq('child_id', filters.childId);

  if (filters.outcomes && filters.outcomes.length > 0) {
    const expr = outcomeOrExpression(filters.outcomes);
    if (expr) query = query.or(expr);
  }

  if (filters.search) {
    const expr = searchOrExpression(filters.search);
    if (expr) query = query.or(expr);
  }

  const { data, error, count } = await query
    .order('recorded_at', { ascending: false })
    .range(fromIndex, fromIndex + pageSize - 1);
  if (error) {
    throw new DashboardDataError(`listAttempts query failed: ${error.message}`, {
      cause: error,
    });
  }

  const rows = (data ?? []).map((row) => toAttempt(RawAttemptRowSchema.parse(row)));
  const total = count ?? 0;

  return { rows, total, page, pageSize };
}

/**
 * Fetch a single attempt by id, or `null` when it does not exist.
 *
 * Raw-row access: dynamic (never cached).
 *
 * @param id - The attempt's uuid.
 * @returns The {@link Attempt}, or `null` if not found.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getAttemptById(id: string): Promise<Attempt | null> {
  noStore();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(ATTEMPTS_VIEW)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new DashboardDataError(
      `getAttemptById query failed: ${error.message}`,
      { cause: error },
    );
  }

  if (!data) return null;
  return toAttempt(RawAttemptRowSchema.parse(data));
}
