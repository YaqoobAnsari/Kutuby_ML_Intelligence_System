import 'server-only';
import { scanEnrichedAttempts, type EnrichedAttempt } from '@/lib/data/enriched';
import { isLetterLabel, labelToArabic } from '@/lib/letters/mapping';
import type { AttemptOutcome, AttemptType } from '@/types/domain';

/** Dataset split assignment (child-stable to avoid train/test leakage). */
export type DatasetSplit = 'train' | 'val' | 'test';

/** The letter pass floor used by the verifier (see INTEGRATIONS/METRICS). */
const LETTER_PASS_FLOOR = 0.45;

/** FNV-1a 32-bit hash of a string (deterministic, dependency-free). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Assign a child to a split deterministically by hashing the child id, so ALL of
 * a child's recordings land in the same split (no speaker leakage across
 * train/val/test). 70 / 15 / 15.
 */
export function splitForChild(childId: string): DatasetSplit {
  const bucket = hashStr(childId) % 100;
  if (bucket < 70) return 'train';
  if (bucket < 85) return 'val';
  return 'test';
}

/** Resolve a display label (glyph-aware for letters). */
function targetLabel(r: EnrichedAttempt): string {
  if (r.attemptType === 'letter' && isLetterLabel(r.target)) {
    const arabic = labelToArabic(r.target);
    if (arabic) return `${arabic} ${r.target}`;
  }
  return r.targetDisplay ?? r.target;
}

/** A flagged attempt in the curation queue, with the reasons it was surfaced. */
export interface CurationItem {
  id: string;
  attemptType: AttemptType;
  target: string;
  targetLabel: string;
  outcome: AttemptOutcome;
  predicted: string | null;
  confidence: number | null;
  reasons: string[];
  score: number;
  hasAudio: boolean;
  recordedAt: string;
}

/** Curation queue payload: ranked items plus reason tallies. */
export interface CurationQueue {
  items: CurationItem[];
  flaggedTotal: number;
  reasonCounts: { label: string; value: number }[];
}

/** Score one attempt for review priority, returning its reasons + weight. */
function scoreAttempt(r: EnrichedAttempt): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;

  if (r.isError) {
    reasons.push('API error');
    score += 5;
  }
  if (r.noSpeech === true) {
    reasons.push('No speech');
    score += 4;
  }
  if (
    r.attemptType === 'letter' &&
    r.outcome === 'fail' &&
    r.predictedLetter !== null &&
    r.predictedLetter !== r.target &&
    r.predictedProbability !== null &&
    r.predictedProbability >= 0.6
  ) {
    reasons.push('Confidently wrong');
    score += 5;
  }
  if (
    r.attemptType === 'letter' &&
    r.targetProbability !== null &&
    r.targetProbability >= LETTER_PASS_FLOOR - 0.1 &&
    r.targetProbability < LETTER_PASS_FLOOR
  ) {
    reasons.push('Borderline');
    score += 3;
  }
  if (r.outcome === 'fail' && r.attemptNumber >= 3) {
    reasons.push('Repeated failure');
    score += 2;
  }

  return { reasons, score };
}

/**
 * Build the curation queue: every attempt that trips at least one review
 * heuristic (API error, no-speech, confidently-wrong, borderline, repeated
 * failure), ranked by priority. This answers "what should we label / fix /
 * retrain on next." Dynamic (never cached).
 *
 * @param limit - Max items to return (default 150).
 * @returns The {@link CurationQueue}.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getCurationQueue(limit = 150): Promise<CurationQueue> {
  const rows = await scanEnrichedAttempts();
  const reasonCounts = new Map<string, number>();
  const scored: CurationItem[] = [];

  for (const r of rows) {
    const { reasons, score } = scoreAttempt(r);
    if (reasons.length === 0) continue;
    for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    scored.push({
      id: r.id,
      attemptType: r.attemptType,
      target: r.target,
      targetLabel: targetLabel(r),
      outcome: r.outcome,
      predicted: r.attemptType === 'letter' ? r.predictedLetter : null,
      confidence: r.confidence,
      reasons,
      score,
      hasAudio: r.hasAudio,
      recordedAt: r.recordedAt,
    });
  }

  scored.sort((a, b) => b.score - a.score || (a.recordedAt < b.recordedAt ? 1 : -1));

  return {
    items: scored.slice(0, Math.max(0, limit)),
    flaggedTotal: scored.length,
    reasonCounts: [...reasonCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
  };
}

/** One row of a dataset export (one per attempt). */
export interface ExportRow {
  id: string;
  child_id: string;
  session_id: string;
  attempt_number: number;
  attempt_type: AttemptType;
  target: string;
  target_display: string | null;
  outcome: AttemptOutcome;
  is_correct: boolean | null;
  predicted: string | null;
  confidence: number | null;
  similarity: number | null;
  model: string | null;
  variant: string | null;
  audio_path: string | null;
  recorded_at: string;
  split: DatasetSplit;
}

/** Filters for a dataset export. */
export interface ExportFilters {
  attemptType?: AttemptType;
  outcome?: AttemptOutcome;
  /** Only rows that have a stored recording. */
  withAudioOnly?: boolean;
}

/** Map an enriched row to an {@link ExportRow} with its split assignment. */
function toExportRow(r: EnrichedAttempt): ExportRow {
  return {
    id: r.id,
    child_id: r.childId,
    session_id: r.sessionId,
    attempt_number: r.attemptNumber,
    attempt_type: r.attemptType,
    target: r.target,
    target_display: r.targetDisplay,
    outcome: r.outcome,
    is_correct: r.isCorrect,
    predicted: r.attemptType === 'letter' ? r.predictedLetter : null,
    confidence: r.confidence,
    similarity: r.similarity,
    model: r.model,
    variant: r.variant,
    audio_path: r.hasAudio ? `pronunciation-recordings/${r.target}` : null,
    recorded_at: r.recordedAt,
    split: splitForChild(r.childId),
  };
}

/**
 * Build dataset export rows (filtered), each tagged with a leakage-safe split.
 * Dynamic (never cached).
 *
 * @param filters - Optional type/outcome/with-audio filters.
 * @returns The export rows.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function buildExportRows(filters: ExportFilters = {}): Promise<ExportRow[]> {
  const rows = await scanEnrichedAttempts();
  return rows
    .filter((r) => (filters.attemptType ? r.attemptType === filters.attemptType : true))
    .filter((r) => (filters.outcome ? r.outcome === filters.outcome : true))
    .filter((r) => (filters.withAudioOnly ? r.hasAudio : true))
    .map(toExportRow);
}

/** Export preview: totals by split and by type for the curation page. */
export interface ExportSummary {
  total: number;
  withAudio: number;
  bySplit: Record<DatasetSplit, number>;
  byType: Record<AttemptType, number>;
}

/**
 * Summarize the exportable dataset (split + type balance) for the page preview.
 * Dynamic (never cached).
 *
 * @returns The {@link ExportSummary}.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getExportSummary(): Promise<ExportSummary> {
  const rows = await scanEnrichedAttempts();
  const bySplit: Record<DatasetSplit, number> = { train: 0, val: 0, test: 0 };
  const byType: Record<AttemptType, number> = { letter: 0, word: 0 };
  let withAudio = 0;

  for (const r of rows) {
    bySplit[splitForChild(r.childId)] += 1;
    byType[r.attemptType] += 1;
    if (r.hasAudio) withAudio += 1;
  }

  return { total: rows.length, withAudio, bySplit, byType };
}
