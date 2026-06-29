import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { outcomeFromIsCorrect } from '@/lib/schemas/attempt';
import { isLetterLabel, labelToArabic } from '@/lib/letters/mapping';
import { DashboardDataError } from '@/lib/data/attempts';
import { TABLE } from '@/types/database';
import type {
  AttemptType,
  DailyPoint,
  OutcomeBreakdown,
  OverviewMetrics,
  TargetStat,
  AttemptFilters,
} from '@/types/domain';

/** Inclusive `recorded_at` range (ISO bounds), reusing the shared filter shape. */
export type DateRange = Pick<AttemptFilters, 'from' | 'to'>;

/**
 * Overview headline metrics. Extends the shared {@link OverviewMetrics} DTO with
 * the recency counters the overview also reports (`recorded_at`-based). The
 * superset is assignable wherever an {@link OverviewMetrics} is expected.
 */
export interface OverviewMetricsResult extends OverviewMetrics {
  /** Attempts whose `recorded_at` falls on the current UTC day. */
  attemptsToday: number;
  /** Attempts whose `recorded_at` is within the last 7 days. */
  attemptsLast7d: number;
}

/** Capture-health summary: total vs with-audio, plus the missing-audio share. */
export interface CaptureHealth {
  /** Total attempts (all rows). */
  total: number;
  /** Attempts with a stored recording (`audio_storage_path IS NOT NULL`). */
  withAudio: number;
  /** Fraction of attempts missing audio in `[0, 1]`; `0` when there are none. */
  nullAudioPct: number;
}

/** Options for {@link getWeakTargets}. */
export interface WeakTargetsOptions {
  /** Restrict to a single model (letters and words are never pooled). */
  attemptType?: AttemptType;
  /** Minimum attempts a target must have to be considered (floor); default 5. */
  minVolume?: number;
  /** Maximum targets to return, ranked worst-first; default 20. */
  limit?: number;
}

/**
 * Page size for the row scan. The dashboard aggregates in-process over the
 * immutable production table (no aggregation views required). This is correct
 * and fast at current volume; if the scan approaches {@link SCAN_MAX_ROWS},
 * promote these aggregates to the `dash_*` materialized views (see
 * supabase/README.md) — the public signatures here stay identical.
 */
const SCAN_READ_PAGE = 1000;

/** Safety ceiling for the row scan. */
const SCAN_MAX_ROWS = 500_000;

/** Default minimum-volume floor for weak-target ranking. */
const DEFAULT_MIN_VOLUME = 5;

/** Default number of weak targets returned. */
const DEFAULT_WEAK_LIMIT = 20;

/** Lightweight projection scanned to compute every overview aggregate. */
const ScanRowSchema = z.object({
  is_correct: z.boolean().nullable(),
  audio_storage_path: z.string().nullable(),
  child_id: z.string(),
  session_id: z.string(),
  recorded_at: z.string(),
  attempt_type: z.string(),
  target_sent_to_api: z.string(),
  target_display: z.string().nullable(),
});

/** A single scanned row. */
type ScanRow = z.infer<typeof ScanRowSchema>;

/** Columns selected for the scan (must match {@link ScanRowSchema}). */
const SCAN_COLUMNS =
  'is_correct,audio_storage_path,child_id,session_id,recorded_at,attempt_type,target_sent_to_api,target_display';

/** PASS / (PASS + FAIL); `null` when there are no scored attempts. */
function passFailRate(pass: number, fail: number): number | null {
  const denom = pass + fail;
  return denom > 0 ? pass / denom : null;
}

/** Narrow a raw `attempt_type` string to the domain union (defaults to 'word'). */
function normalizeAttemptType(value: string): AttemptType {
  return value === 'letter' ? 'letter' : 'word';
}

/** Resolve a display label, prefixing the Arabic glyph for known letter labels. */
function resolveTargetLabel(
  attemptType: AttemptType,
  target: string,
  display: string | null,
): string {
  if (attemptType === 'letter' && isLetterLabel(target)) {
    const arabic = labelToArabic(target);
    if (arabic) return `${arabic} ${target}`;
  }
  return display ?? target;
}

/** UTC midnight (epoch ms) for the day containing `ms`. */
function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC `YYYY-MM-DD` bucket key for an ISO timestamp. */
function utcDateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Scan the production table for the lightweight projection used by every
 * overview aggregate, paged to stay within PostgREST's max-rows. Ordered by
 * `recorded_at` desc; bounded by {@link SCAN_MAX_ROWS}.
 *
 * @param range - Inclusive `recorded_at` bounds (both optional).
 * @returns All matching rows for the range.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
async function scanAttempts(range: DateRange): Promise<ScanRow[]> {
  noStore();
  const supabase = createServiceClient();
  const rows: ScanRow[] = [];

  let offset = 0;
  for (;;) {
    let query = supabase.from(TABLE).select(SCAN_COLUMNS);
    if (range.from) query = query.gte('recorded_at', range.from);
    if (range.to) query = query.lte('recorded_at', range.to);

    const { data, error } = await query
      .order('recorded_at', { ascending: false })
      .range(offset, offset + SCAN_READ_PAGE - 1);
    if (error) {
      throw new DashboardDataError(`overview scan failed: ${error.message}`, {
        cause: error,
      });
    }

    const batch = data ?? [];
    for (const raw of batch) rows.push(ScanRowSchema.parse(raw));

    if (batch.length < SCAN_READ_PAGE) break;
    offset += SCAN_READ_PAGE;
    if (offset >= SCAN_MAX_ROWS) break;
  }

  return rows;
}

/** Compute the headline metrics from scanned rows. */
function computeMetrics(rows: readonly ScanRow[]): OverviewMetricsResult {
  const sessions = new Set<string>();
  const children = new Set<string>();
  const breakdown: OutcomeBreakdown = { pass: 0, fail: 0, error: 0, total: 0 };
  let attemptsWithAudio = 0;
  let attemptsToday = 0;
  let attemptsLast7d = 0;

  const now = Date.now();
  const startToday = startOfUtcDay(now);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    breakdown[outcomeFromIsCorrect(row.is_correct)] += 1;
    breakdown.total += 1;
    if (row.audio_storage_path !== null) attemptsWithAudio += 1;
    sessions.add(row.session_id);
    children.add(row.child_id);
    const t = new Date(row.recorded_at).getTime();
    if (Number.isFinite(t)) {
      if (t >= startToday) attemptsToday += 1;
      if (t >= sevenDaysAgo) attemptsLast7d += 1;
    }
  }

  return {
    totalAttempts: breakdown.total,
    attemptsWithAudio,
    totalSessions: sessions.size,
    uniqueChildren: children.size,
    passCount: breakdown.pass,
    failCount: breakdown.fail,
    errorCount: breakdown.error,
    passRate: passFailRate(breakdown.pass, breakdown.fail),
    errorRate: breakdown.total > 0 ? breakdown.error / breakdown.total : null,
    attemptsToday,
    attemptsLast7d,
  };
}

/** Bucket scanned rows into a daily series (UTC), ascending by date. */
function computeDailyGrowth(rows: readonly ScanRow[]): DailyPoint[] {
  const byDay = new Map<string, { total: number; pass: number; fail: number; error: number }>();

  for (const row of rows) {
    const key = utcDateKey(row.recorded_at);
    const bucket = byDay.get(key) ?? { total: 0, pass: 0, fail: 0, error: 0 };
    bucket.total += 1;
    bucket[outcomeFromIsCorrect(row.is_correct)] += 1;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, b]) => ({
      date,
      total: b.total,
      pass: b.pass,
      fail: b.fail,
      error: b.error,
      passRate: passFailRate(b.pass, b.fail),
    }));
}

/** Rank weakest targets (worst combined fail+error rate first) from scanned rows. */
function computeWeakTargets(
  rows: readonly ScanRow[],
  opts: WeakTargetsOptions = {},
): TargetStat[] {
  const minVolume = opts.minVolume ?? DEFAULT_MIN_VOLUME;
  const limit = opts.limit ?? DEFAULT_WEAK_LIMIT;

  const groups = new Map<
    string,
    { attemptType: AttemptType; target: string; display: string | null; pass: number; fail: number; error: number; total: number }
  >();

  for (const row of rows) {
    const attemptType = normalizeAttemptType(row.attempt_type);
    if (opts.attemptType && attemptType !== opts.attemptType) continue;
    const target = row.target_sent_to_api;
    const key = `${attemptType} ${target}`;
    const g =
      groups.get(key) ??
      { attemptType, target, display: row.target_display, pass: 0, fail: 0, error: 0, total: 0 };
    g[outcomeFromIsCorrect(row.is_correct)] += 1;
    g.total += 1;
    groups.set(key, g);
  }

  return [...groups.values()]
    .filter((g) => g.total >= minVolume)
    .map((g) => ({
      stat: {
        attemptType: g.attemptType,
        target: g.target,
        label: resolveTargetLabel(g.attemptType, g.target, g.display),
        total: g.total,
        pass: g.pass,
        fail: g.fail,
        error: g.error,
        passRate: passFailRate(g.pass, g.fail),
      } satisfies TargetStat,
      failErrorRate: g.total > 0 ? (g.fail + g.error) / g.total : 0,
    }))
    .sort((a, b) => b.failErrorRate - a.failErrorRate || b.stat.total - a.stat.total)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.stat);
}

/**
 * Compute the Executive Overview headline metrics over a `recorded_at` range.
 * Aggregated in-process from a single table scan. Dynamic (never cached).
 *
 * @param range - Inclusive `recorded_at` bounds (both optional).
 * @returns The {@link OverviewMetricsResult} for the range.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getOverviewMetrics(
  range: DateRange,
): Promise<OverviewMetricsResult> {
  return computeMetrics(await scanAttempts(range));
}

/**
 * Daily attempt/outcome counts over a `recorded_at` range (UTC buckets),
 * ascending by date for charting. Dynamic (never cached).
 *
 * @param range - Inclusive `recorded_at` bounds (both optional).
 * @returns One {@link DailyPoint} per day in range.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getDailyGrowth(range: DateRange): Promise<DailyPoint[]> {
  return computeDailyGrowth(await scanAttempts(range));
}

/**
 * Rank the weakest targets by combined fail+error rate, applying a
 * minimum-volume floor and keeping letters and words separated.
 * Dynamic (never cached).
 *
 * @param opts - Optional `attemptType`, `minVolume` floor, and result `limit`.
 * @returns Worst-first {@link TargetStat} rows (length <= `limit`).
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getWeakTargets(
  opts: WeakTargetsOptions = {},
): Promise<TargetStat[]> {
  return computeWeakTargets(await scanAttempts({}), opts);
}

/**
 * Capture health across all attempts: total, attempts-with-audio, and the
 * missing-audio share. Uses exact head counts (no row payload). Dynamic.
 *
 * @returns A {@link CaptureHealth} summary.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getCaptureHealth(): Promise<CaptureHealth> {
  noStore();
  const supabase = createServiceClient();

  const totalResult = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true });
  if (totalResult.error) {
    throw new DashboardDataError(
      `getCaptureHealth total query failed: ${totalResult.error.message}`,
      { cause: totalResult.error },
    );
  }

  const audioResult = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .not('audio_storage_path', 'is', null);
  if (audioResult.error) {
    throw new DashboardDataError(
      `getCaptureHealth with-audio query failed: ${audioResult.error.message}`,
      { cause: audioResult.error },
    );
  }

  const total = totalResult.count ?? 0;
  const withAudio = audioResult.count ?? 0;
  const nullAudioPct = total > 0 ? (total - withAudio) / total : 0;

  return { total, withAudio, nullAudioPct };
}

/** Aggregated payload backing the Executive Overview page. */
export interface OverviewData {
  /** Headline KPIs (superset of {@link OverviewMetrics}). */
  metrics: OverviewMetricsResult;
  /** Daily growth series (ascending by date). */
  daily: DailyPoint[];
  /** Weakest letters, worst-first. */
  weakLetters: TargetStat[];
  /** Weakest words, worst-first. */
  weakWords: TargetStat[];
}

/**
 * Fetch everything the Executive Overview renders in ONE table scan: headline
 * metrics, the daily growth series, and the weakest letters and words.
 * Dynamic (never cached).
 *
 * @param range - Optional inclusive `recorded_at` bounds (defaults to all-time).
 * @returns The {@link OverviewData} payload for the overview page.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getOverviewData(
  range: DateRange = {},
): Promise<OverviewData> {
  const rows = await scanAttempts(range);
  return {
    metrics: computeMetrics(rows),
    daily: computeDailyGrowth(rows),
    weakLetters: computeWeakTargets(rows, { attemptType: 'letter' }),
    weakWords: computeWeakTargets(rows, { attemptType: 'word' }),
  };
}
