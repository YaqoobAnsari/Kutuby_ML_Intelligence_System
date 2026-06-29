import { z } from 'zod';
import { isLetterLabel, labelToArabic } from '@/lib/letters/mapping';
import type { Attempt, AttemptOutcome, AttemptType } from '@/types/domain';

/**
 * Tolerant Zod schema for a raw `child_pronunciation_attempt` row. The jsonb
 * columns are accepted as `unknown` and parsed downstream by their own schemas.
 */
export const RawAttemptRowSchema = z.object({
  id: z.string(),
  child_id: z.string(),
  session_id: z.string(),
  attempt_number: z.number(),
  attempt_type: z.string(),
  target_display: z.string().nullable(),
  target_sent_to_api: z.string(),
  is_correct: z.boolean().nullable(),
  model_output: z.unknown(),
  client_context: z.unknown(),
  audio_storage_path: z.string().nullable(),
  recorded_at: z.string(),
  created_at: z.string(),
});

/** Inferred type of a tolerantly-parsed raw row. */
export type RawAttemptRow = z.infer<typeof RawAttemptRowSchema>;

/**
 * Derive the outcome from `is_correct`.
 * - true  -> 'pass'
 * - false -> 'fail'
 * - null  -> 'error'
 */
export function outcomeFromIsCorrect(
  isCorrect: boolean | null,
): AttemptOutcome {
  if (isCorrect === true) return 'pass';
  if (isCorrect === false) return 'fail';
  return 'error';
}

/** Narrow the raw `attempt_type` string to the domain union (defaults to 'word'). */
function normalizeAttemptType(value: string): AttemptType {
  return value === 'letter' ? 'letter' : 'word';
}

/**
 * Resolve a display-ready target label.
 * For letters, prefer the glyph from the canonical mapping; otherwise fall back
 * to `target_display`, then to `target_sent_to_api`.
 */
function resolveTargetLabel(
  attemptType: AttemptType,
  targetSentToApi: string,
  targetDisplay: string | null,
): string {
  if (attemptType === 'letter' && isLetterLabel(targetSentToApi)) {
    const arabic = labelToArabic(targetSentToApi);
    if (arabic) return `${arabic} ${targetSentToApi}`;
  }
  return targetDisplay ?? targetSentToApi;
}

/**
 * Map a raw production row to the UI-friendly {@link Attempt} DTO.
 * Computes the outcome and resolves a display label; jsonb columns are passed
 * through untouched for downstream tolerant parsing.
 */
export function toAttempt(row: RawAttemptRow): Attempt {
  const attemptType = normalizeAttemptType(row.attempt_type);
  return {
    id: row.id,
    childId: row.child_id,
    sessionId: row.session_id,
    attemptNumber: row.attempt_number,
    attemptType,
    outcome: outcomeFromIsCorrect(row.is_correct),
    isCorrect: row.is_correct,
    targetLabel: resolveTargetLabel(
      attemptType,
      row.target_sent_to_api,
      row.target_display,
    ),
    targetSentToApi: row.target_sent_to_api,
    targetDisplay: row.target_display,
    audioStoragePath: row.audio_storage_path,
    hasAudio: row.audio_storage_path !== null,
    modelOutput: row.model_output,
    clientContext: row.client_context,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}
