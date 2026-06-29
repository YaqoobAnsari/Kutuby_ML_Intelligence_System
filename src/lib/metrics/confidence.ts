import type { AttemptType } from '@/types/domain';
import {
  LetterOutputSchema,
  WordOutputSchema,
} from '@/lib/schemas/model-output';

/**
 * CALIBRATION WARNING — letter confidence and word confidence are DIFFERENT
 * scales with DIFFERENT semantics and MUST NOT be merged onto a single axis or
 * blended into one number. Word `confidence` is explicitly UNCALIBRATED. Letter
 * probabilities (`target_probability` / `predicted_probability`) live in [0, 1];
 * the `confidence` fields are reported on a 0..100 scale. Always render and
 * aggregate them per-model, never together.
 */

/** Per-model confidence signals for a LETTER attempt. `null` when unavailable. */
export interface LetterConfidence {
  /** Discriminator. */
  kind: 'letter';
  /** Model probability assigned to the intended target letter, in [0, 1]. */
  targetProbability: number | null;
  /** Model probability of its top predicted letter, in [0, 1]. */
  predictedProbability: number | null;
  /** Reported confidence on a 0..100 scale (distinct from word confidence). */
  confidence: number | null;
}

/** Per-model confidence signals for a WORD attempt. `null` when unavailable. */
export interface WordConfidence {
  /** Discriminator. */
  kind: 'word';
  /** Acoustic/text similarity score reported by the word model. */
  similarity: number | null;
  /** Reported confidence on a 0..100 scale; UNCALIBRATED — see file header. */
  confidence: number | null;
}

/** Discriminated confidence result; shape depends on the attempt type. */
export type ConfidenceMetrics = LetterConfidence | WordConfidence;

/** Coerce an unknown value to a finite number, or `null` (rejects `NaN`/`Infinity`). */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Extract the per-model confidence numeric(s) from a raw `model_output` value.
 *
 * The returned shape is selected by `attemptType` (never inferred), so letter and
 * word signals are kept strictly separate. The parse is fully null-safe: error
 * payloads (`{ error: "..." }`), `null`/`undefined`, and any shape missing the
 * required `result` boolean fail tolerant parsing and yield all-`null` fields.
 *
 * @param modelOutput - The raw `model_output` jsonb value.
 * @param attemptType - Whether to extract letter or word signals.
 * @returns A discriminated {@link ConfidenceMetrics} with numeric fields or `null`.
 */
export function extractConfidence(
  modelOutput: unknown,
  attemptType: AttemptType,
): ConfidenceMetrics {
  if (attemptType === 'letter') {
    const parsed = LetterOutputSchema.safeParse(modelOutput);
    const data = parsed.success ? parsed.data : undefined;
    return {
      kind: 'letter',
      targetProbability: finiteOrNull(data?.target_probability),
      predictedProbability: finiteOrNull(data?.predicted_probability),
      confidence: finiteOrNull(data?.confidence),
    };
  }

  const parsed = WordOutputSchema.safeParse(modelOutput);
  const data = parsed.success ? parsed.data : undefined;
  return {
    kind: 'word',
    similarity: finiteOrNull(data?.similarity),
    confidence: finiteOrNull(data?.confidence),
  };
}

/** A single histogram bucket: a half-open range `[start, end)` (last bin is closed) and its count. */
export interface HistogramBin {
  /** Inclusive lower edge of the bucket. */
  start: number;
  /** Upper edge (exclusive, except the final bucket which is inclusive of `max`). */
  end: number;
  /** Number of input values falling in this bucket. */
  count: number;
}

/** Optional fixed range for {@link histogram}; defaults to the data's own min/max. */
export interface HistogramRange {
  /** Lower edge of the first bucket. */
  min: number;
  /** Upper edge of the last bucket. */
  max: number;
}

/**
 * Bucket numeric values into equal-width bins and return per-bucket counts.
 *
 * Buckets are half-open `[start, end)`; the final bucket is closed so values
 * equal to `max` land in the last bin. Values outside the range are clamped into
 * the nearest edge bucket. When `min === max` (zero width) all values fall in the
 * first bin.
 *
 * Pass an explicit `range` (e.g. `{ min: 0, max: 1 }` for letter probabilities or
 * `{ min: 0, max: 100 }` for the confidence scale) to compare distributions
 * across datasets; otherwise the range is derived from the values themselves.
 *
 * @param values - The numeric values to bin (not mutated).
 * @param bins - Number of equal-width buckets; `<= 0` yields `[]`.
 * @param range - Optional fixed `[min, max]`; defaults to the data's min/max.
 * @returns One {@link HistogramBin} per bucket, or `[]` when binning is impossible.
 */
export function histogram(
  values: readonly number[],
  bins: number,
  range?: HistogramRange,
): HistogramBin[] {
  if (!Number.isInteger(bins) || bins <= 0) return [];

  let min: number;
  let max: number;
  if (range) {
    min = range.min;
    max = range.max;
  } else {
    if (values.length === 0) return [];
    min = Math.min(...values);
    max = Math.max(...values);
  }

  const width = (max - min) / bins;
  const result: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    start: min + i * width,
    end: i === bins - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    let index: number;
    if (width === 0) {
      index = 0;
    } else {
      index = Math.floor((value - min) / width);
      if (index < 0) index = 0;
      if (index > bins - 1) index = bins - 1;
    }
    result[index].count += 1;
  }

  return result;
}
