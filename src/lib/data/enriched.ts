import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { DashboardDataError } from '@/lib/data/attempts';
import { outcomeFromIsCorrect } from '@/lib/schemas/attempt';
import { TABLE } from '@/types/database';
import type { AttemptOutcome, AttemptType } from '@/types/domain';

/**
 * A fully-extracted attempt: hot fields pulled out of the `model_output` /
 * `client_context` jsonb into typed columns for in-process analytics. Letter and
 * word confidence are DIFFERENT scales and must never be pooled.
 */
export interface EnrichedAttempt {
  /** Attempt row id. */
  id: string;
  /** Child uuid (used for leakage-free dataset splits). */
  childId: string;
  /** Session grouping retries within a lesson step. */
  sessionId: string;
  /** 1-based attempt index within the session. */
  attemptNumber: number;
  /** Letter or word. */
  attemptType: AttemptType;
  /** Canonical target (letter label like `Alif`, or the word string). */
  target: string;
  /** UI glyph/word shown to the child, if captured. */
  targetDisplay: string | null;
  /** Raw is_correct. */
  isCorrect: boolean | null;
  /** Derived outcome. */
  outcome: AttemptOutcome;
  /** Predicted letter label (letters only). */
  predictedLetter: string | null;
  /** Top-class probability in `[0,1]` (letters). */
  predictedProbability: number | null;
  /** Probability assigned to the target class in `[0,1]` (letters). */
  targetProbability: number | null;
  /** API-reported confidence (letters: target-prob %; words: 0–100, uncalibrated). */
  confidence: number | null;
  /** Similarity score where reported. */
  similarity: number | null;
  /** Serving model id (e.g. `tarteel-ai/whisper-base-ar-quran`). */
  model: string | null;
  /** Serving variant (e.g. `tarteel`, `wav2vec2-base-letters`). */
  variant: string | null;
  /** Whether the clip was flagged as containing no speech (letters). */
  noSpeech: boolean | null;
  /** Whether the model call itself failed (`model_output` was `{ error }`). */
  isError: boolean;
  /** Whether a recording was stored for this attempt. */
  hasAudio: boolean;
  /** Server-side inference time (ms). */
  serverLatencyMs: number | null;
  /** Client-measured round-trip latency (ms). */
  clientLatencyMs: number | null;
  /** Recording duration (ms). */
  recordingDurationMs: number | null;
  /** Capture platform. */
  platform: string | null;
  /** App version. */
  appVersion: string | null;
  /** Whether the capture device was a simulator. */
  isSimulator: boolean | null;
  /** When the attempt was recorded. */
  recordedAt: string;
}

const RowSchema = z.object({
  id: z.string(),
  child_id: z.string(),
  session_id: z.string(),
  attempt_number: z.number(),
  attempt_type: z.string(),
  target_sent_to_api: z.string(),
  target_display: z.string().nullable(),
  is_correct: z.boolean().nullable(),
  model_output: z.unknown(),
  client_context: z.unknown(),
  audio_storage_path: z.string().nullable(),
  recorded_at: z.string(),
});

const SELECT =
  'id,child_id,session_id,attempt_number,attempt_type,target_sent_to_api,target_display,is_correct,model_output,client_context,audio_storage_path,recorded_at';
const READ_PAGE = 1000;
const MAX_ROWS = 500_000;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Extract a `{ label: number }` probability map, dropping non-numeric entries. */
function probMap(v: unknown): Record<string, number> | null {
  if (v === null || typeof v !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function toEnriched(raw: z.infer<typeof RowSchema>): EnrichedAttempt {
  const mo = rec(raw.model_output);
  const ctx = rec(raw.client_context);
  const extraction = rec(mo.extraction_metadata);
  return {
    id: raw.id,
    childId: raw.child_id,
    sessionId: raw.session_id,
    attemptNumber: raw.attempt_number,
    attemptType: raw.attempt_type === 'letter' ? 'letter' : 'word',
    target: raw.target_sent_to_api,
    targetDisplay: raw.target_display,
    isCorrect: raw.is_correct,
    outcome: outcomeFromIsCorrect(raw.is_correct),
    predictedLetter: str(mo.predicted_letter),
    predictedProbability: num(mo.predicted_probability),
    targetProbability: num(mo.target_probability),
    confidence: num(mo.confidence),
    similarity: num(mo.similarity),
    model: str(mo.model),
    variant: str(mo.variant),
    noSpeech: bool(extraction.no_speech),
    isError: typeof mo.error === 'string',
    hasAudio: raw.audio_storage_path !== null,
    serverLatencyMs: num(mo.processing_time_ms) ?? num(mo.latency_ms),
    clientLatencyMs: num(ctx.apiLatencyMs),
    recordingDurationMs: num(ctx.recordingDurationMs),
    platform: str(ctx.platform),
    appVersion: str(ctx.appVersion),
    isSimulator: bool(ctx.isSimulator),
    recordedAt: raw.recorded_at,
  };
}

/** Probability distribution map (label → prob) for a letter attempt, if present. */
export function allProbabilities(modelOutput: unknown): Record<string, number> | null {
  return probMap(rec(modelOutput).all_probabilities);
}

/**
 * Scan the production table and return fully-enriched attempts for in-process
 * analytics (Model Intelligence, Dataset Quality). Paged to stay within
 * PostgREST limits; bounded by a safety ceiling. Dynamic (never cached).
 *
 * @returns Every attempt as an {@link EnrichedAttempt}.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function scanEnrichedAttempts(): Promise<EnrichedAttempt[]> {
  noStore();
  const supabase = createServiceClient();
  const rows: EnrichedAttempt[] = [];

  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT)
      .order('recorded_at', { ascending: false })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      throw new DashboardDataError(`enriched scan failed: ${error.message}`, {
        cause: error,
      });
    }
    const batch = data ?? [];
    for (const raw of batch) rows.push(toEnriched(RowSchema.parse(raw)));
    if (batch.length < READ_PAGE) break;
    offset += READ_PAGE;
    if (offset >= MAX_ROWS) break;
  }

  return rows;
}
