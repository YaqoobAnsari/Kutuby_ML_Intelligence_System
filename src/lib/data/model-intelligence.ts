import 'server-only';
import { scanEnrichedAttempts, type EnrichedAttempt } from '@/lib/data/enriched';
import {
  ARABIC_LETTER_LABELS,
  isLetterLabel,
  labelToArabic,
} from '@/lib/letters/mapping';
import type { AttemptType } from '@/types/domain';

/** Headline stats for one model (letters or words), never pooled. */
export interface PerModelStats {
  attemptType: AttemptType;
  total: number;
  pass: number;
  fail: number;
  error: number;
  /** PASS / (PASS + FAIL); null when no scored attempts. */
  passRate: number | null;
  /** Letters: mean top-class probability (%); words: mean confidence (0–100). */
  avgConfidence: number | null;
  /** Mean server-side inference latency (ms). */
  avgServerLatencyMs: number | null;
  /** Distinct serving model ids observed. */
  models: string[];
}

/** A 28×28 letter confusion matrix (target rows × predicted columns). */
export interface LetterConfusion {
  /** Axis labels in canonical order. */
  labels: string[];
  /** label → Arabic glyph. */
  glyphs: Record<string, string>;
  /** One row per target label. */
  rows: {
    target: string;
    total: number;
    correct: number;
    cells: Record<string, number>;
  }[];
  /** Total letter attempts that carried a prediction. */
  totalClassified: number;
}

/** A labeled value with its supporting volume (for ranked bars). */
export interface LabeledValue {
  label: string;
  value: number;
  total: number;
}

/** One bucket of a confidence histogram. */
export interface ConfidenceBin {
  label: string;
  count: number;
}

/** Volume per (model, variant) for one attempt type. */
export interface ModelVariantStat {
  model: string;
  variant: string;
  attemptType: AttemptType;
  count: number;
}

/** Everything the Model Intelligence page renders. */
export interface ModelIntelligence {
  perModel: PerModelStats[];
  confusion: LetterConfusion;
  letterAccuracy: LabeledValue[];
  confidenceLetters: ConfidenceBin[];
  confidenceWords: ConfidenceBin[];
  modelVariants: ModelVariantStat[];
}

/** Arithmetic mean of finite numbers, or null when empty. */
function mean(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** Bucket 0–100 values into ten 10-wide bins as ordered histogram bars. */
function confidenceBins(values: number[]): ConfidenceBin[] {
  const bins: ConfidenceBin[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${i * 10 + 10}`,
    count: 0,
  }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = Math.min(9, Math.max(0, Math.floor(v / 10)));
    bins[idx].count += 1;
  }
  return bins;
}

/** Compute per-model headline stats for one attempt type. */
function perModel(rows: EnrichedAttempt[], attemptType: AttemptType): PerModelStats {
  const subset = rows.filter((r) => r.attemptType === attemptType);
  let pass = 0;
  let fail = 0;
  let error = 0;
  for (const r of subset) {
    if (r.outcome === 'pass') pass += 1;
    else if (r.outcome === 'fail') fail += 1;
    else error += 1;
  }
  const confValues =
    attemptType === 'letter'
      ? subset
          .map((r) => (r.predictedProbability !== null ? r.predictedProbability * 100 : NaN))
          .filter((v) => Number.isFinite(v))
      : subset.map((r) => r.confidence).filter((v): v is number => v !== null);

  return {
    attemptType,
    total: subset.length,
    pass,
    fail,
    error,
    passRate: pass + fail > 0 ? pass / (pass + fail) : null,
    avgConfidence: mean(confValues),
    avgServerLatencyMs: mean(
      subset.map((r) => r.serverLatencyMs).filter((v): v is number => v !== null),
    ),
    models: [...new Set(subset.map((r) => r.model).filter((v): v is string => v !== null))],
  };
}

/** Build the 28×28 letter confusion matrix from predicted-vs-target labels. */
function buildConfusion(rows: EnrichedAttempt[]): LetterConfusion {
  const labels = [...ARABIC_LETTER_LABELS];
  const glyphs: Record<string, string> = {};
  for (const l of labels) glyphs[l] = labelToArabic(l) ?? '';

  const matrix = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const correct = new Map<string, number>();
  let totalClassified = 0;

  for (const r of rows) {
    if (r.attemptType !== 'letter') continue;
    if (!isLetterLabel(r.target) || r.predictedLetter === null) continue;
    const target = r.target;
    const predicted = r.predictedLetter;
    totals.set(target, (totals.get(target) ?? 0) + 1);
    if (predicted === target) correct.set(target, (correct.get(target) ?? 0) + 1);
    totalClassified += 1;
    if (!isLetterLabel(predicted)) continue;
    const row = matrix.get(target) ?? new Map<string, number>();
    row.set(predicted, (row.get(predicted) ?? 0) + 1);
    matrix.set(target, row);
  }

  const rowsOut = labels.map((target) => ({
    target,
    total: totals.get(target) ?? 0,
    correct: correct.get(target) ?? 0,
    cells: Object.fromEntries(matrix.get(target) ?? new Map<string, number>()),
  }));

  return { labels, glyphs, rows: rowsOut, totalClassified };
}

/** Per-letter pass rate (%), worst-first, for ranked bars. */
function letterAccuracy(rows: EnrichedAttempt[]): LabeledValue[] {
  const totals = new Map<string, number>();
  const passes = new Map<string, number>();
  for (const r of rows) {
    if (r.attemptType !== 'letter' || !isLetterLabel(r.target)) continue;
    totals.set(r.target, (totals.get(r.target) ?? 0) + 1);
    if (r.outcome === 'pass') passes.set(r.target, (passes.get(r.target) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([label, total]) => ({
      label: `${labelToArabic(label) ?? ''} ${label}`.trim(),
      value: total > 0 ? ((passes.get(label) ?? 0) / total) * 100 : 0,
      total,
    }))
    .sort((a, b) => a.value - b.value || b.total - a.total);
}

/** Volume per (model, variant, type). */
function modelVariants(rows: EnrichedAttempt[]): ModelVariantStat[] {
  const groups = new Map<string, ModelVariantStat>();
  for (const r of rows) {
    const model = r.model ?? 'unknown';
    const variant = r.variant ?? 'unknown';
    const key = `${r.attemptType} ${model} ${variant}`;
    const g = groups.get(key) ?? { model, variant, attemptType: r.attemptType, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * Compute everything for the Model Intelligence page from a single enriched
 * scan: per-model headline stats, the letter confusion matrix, per-class
 * accuracy, per-model confidence histograms (never pooled — word confidence is
 * uncalibrated), and the model/variant breakdown. Dynamic (never cached).
 *
 * @returns The {@link ModelIntelligence} payload.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getModelIntelligence(): Promise<ModelIntelligence> {
  const rows = await scanEnrichedAttempts();

  const letterConf = rows
    .filter((r) => r.attemptType === 'letter')
    .map((r) => (r.predictedProbability !== null ? r.predictedProbability * 100 : NaN));
  const wordConf = rows
    .filter((r) => r.attemptType === 'word')
    .map((r) => r.confidence)
    .filter((v): v is number => v !== null);

  return {
    perModel: [perModel(rows, 'letter'), perModel(rows, 'word')],
    confusion: buildConfusion(rows),
    letterAccuracy: letterAccuracy(rows),
    confidenceLetters: confidenceBins(letterConf),
    confidenceWords: confidenceBins(wordConf),
    modelVariants: modelVariants(rows),
  };
}
