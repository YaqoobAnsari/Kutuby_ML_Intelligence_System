/**
 * UI-friendly domain DTOs and shared unions for the dashboard.
 * These are the contracts consumed by data-access, hooks, and components.
 */

/**
 * Outcome taxonomy (use everywhere):
 * - `pass`  = is_correct === true
 * - `fail`  = is_correct === false
 * - `error` = is_correct === null (API/network failure)
 */
export type AttemptOutcome = 'pass' | 'fail' | 'error';

/** The kind of pronunciation target a verification call addressed. */
export type AttemptType = 'letter' | 'word';

/**
 * A parsed, typed view of a single `child_pronunciation_attempt` row,
 * with the outcome derived and the target label resolved for display.
 */
export interface Attempt {
  /** uuid PK of the underlying row. */
  id: string;
  /** uuid of the child who made the attempt. */
  childId: string;
  /** Session grouping retries within a lesson step. */
  sessionId: string;
  /** 1-based attempt index within the session. */
  attemptNumber: number;
  /** Whether this was a letter or word attempt. */
  attemptType: AttemptType;
  /** Derived outcome (pass/fail/error). */
  outcome: AttemptOutcome;
  /** Raw is_correct (true/false/null) preserved for transparency. */
  isCorrect: boolean | null;
  /** Resolved, display-ready target label (glyph-aware for letters). */
  targetLabel: string;
  /** Canonical grouping key (letter label or word string). */
  targetSentToApi: string;
  /** UI glyph or word shown to the child, if captured. */
  targetDisplay: string | null;
  /** Storage KEY for the recording; null if upload failed. */
  audioStoragePath: string | null;
  /** Whether a recording exists for this attempt. */
  hasAudio: boolean;
  /** Raw model output (tolerantly parsed, structure varies). */
  modelOutput: unknown;
  /** Raw client context (tolerantly parsed, structure varies). */
  clientContext: unknown;
  /** When the attempt was recorded (behavioral time-series). */
  recordedAt: string;
  /** Row insert time (ingestion timing). */
  createdAt: string;
}

/** High-level KPIs for the overview view. */
export interface OverviewMetrics {
  /** Total attempts in scope. */
  totalAttempts: number;
  /** Attempts that have an associated recording. */
  attemptsWithAudio: number;
  /** Distinct sessions in scope. */
  totalSessions: number;
  /** Distinct children in scope. */
  uniqueChildren: number;
  /** Count of PASS outcomes. */
  passCount: number;
  /** Count of FAIL outcomes. */
  failCount: number;
  /** Count of ERROR outcomes. */
  errorCount: number;
  /** PASS / (PASS + FAIL), excluding errors; null when undefined. */
  passRate: number | null;
  /** ERROR / total; null when no attempts. */
  errorRate: number | null;
}

/** PASS/FAIL/ERROR counts with derived ratios. */
export interface OutcomeBreakdown {
  /** Count of PASS outcomes. */
  pass: number;
  /** Count of FAIL outcomes. */
  fail: number;
  /** Count of ERROR outcomes. */
  error: number;
  /** Total across all outcomes. */
  total: number;
}

/** A single day's aggregated outcomes for time-series charts. */
export interface DailyPoint {
  /** ISO date (YYYY-MM-DD) bucket key, based on recorded_at. */
  date: string;
  /** Total attempts that day. */
  total: number;
  /** PASS count that day. */
  pass: number;
  /** FAIL count that day. */
  fail: number;
  /** ERROR count that day. */
  error: number;
  /** PASS / (PASS + FAIL) that day; null when undefined. */
  passRate: number | null;
}

/** Aggregated performance for one target (letter label or word). */
export interface TargetStat {
  /** Canonical grouping key (target_sent_to_api). */
  target: string;
  /** Display-ready label (glyph-aware for letters). */
  label: string;
  /** Whether this target is a letter or a word. */
  attemptType: AttemptType;
  /** Total attempts for this target. */
  total: number;
  /** PASS count. */
  pass: number;
  /** FAIL count. */
  fail: number;
  /** ERROR count. */
  error: number;
  /** PASS / (PASS + FAIL); null when undefined. */
  passRate: number | null;
}

/** Filter state shared across views (URL-syncable). */
export interface AttemptFilters {
  /** Inclusive start of the recorded_at range (ISO), if set. */
  from?: string;
  /** Inclusive end of the recorded_at range (ISO), if set. */
  to?: string;
  /** Restrict to a single attempt type. */
  attemptType?: AttemptType;
  /** Restrict to one or more outcomes. */
  outcomes?: AttemptOutcome[];
  /** Restrict to a single canonical target. */
  target?: string;
  /** Restrict to a single child. */
  childId?: string;
  /** Free-text search (e.g. target or session). */
  search?: string;
}

/** A page of results plus pagination metadata. */
export interface Paginated<T> {
  /** The rows for this page. */
  rows: T[];
  /** Total rows matching the query (across all pages). */
  total: number;
  /** 1-based page number. */
  page: number;
  /** Page size used for this query. */
  pageSize: number;
}
