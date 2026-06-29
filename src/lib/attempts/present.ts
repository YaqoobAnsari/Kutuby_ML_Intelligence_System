import { parseModelOutput } from '@/lib/schemas/model-output';
import { parseClientContext } from '@/lib/schemas/client-context';
import type { Attempt } from '@/types/domain';

/** Narrow an unknown to a finite number, else null. */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Narrow an unknown to a non-empty string, else null. */
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Coerce an unknown jsonb value to a plain record for tolerant field reads. */
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * Display-ready projection of an {@link Attempt}'s `model_output` / `client_context`.
 * Per-model fields are read tolerantly (the JSON shapes evolve); letter and word
 * confidence are DIFFERENT scales and must never be compared across types.
 */
export interface AttemptPresentation {
  /** True when the model call failed (`model_output` was `{ error }`). */
  isError: boolean;
  /** The error message, when {@link isError}. */
  errorMessage: string | null;
  /** Predicted letter (letters) or transcription (words). */
  prediction: string | null;
  /** Per-model confidence (letters: target-prob %, words: 0–100; uncalibrated). */
  confidence: number | null;
  /** Similarity score where reported. */
  similarity: number | null;
  /** Human-readable model message. */
  message: string | null;
  /** Serving model id (e.g. `facebook/wav2vec2-base`). */
  model: string | null;
  /** Serving variant (e.g. `tarteel`, `wav2vec2-base-letters`). */
  variant: string | null;
  /** Server-side inference time (ms), when reported. */
  serverLatencyMs: number | null;
  /** Client-measured round-trip latency (ms) — includes network/cold start. */
  clientLatencyMs: number | null;
  /** Capture device platform. */
  platform: string | null;
  /** App version that produced the attempt. */
  appVersion: string | null;
  /** Capture device model. */
  deviceModel: string | null;
  /** Recording duration (ms). */
  recordingDurationMs: number | null;
  /** Whether the app detected speech in the clip. */
  speechDetected: boolean | null;
  /** Why recording stopped (e.g. `timer_expired`, `speech_ended`). */
  stopReason: string | null;
}

/**
 * Build the display projection for an attempt. Pure and client-safe (no I/O).
 *
 * @param a - The attempt to present.
 * @returns Tolerantly-extracted, display-ready fields.
 */
export function presentAttempt(a: Attempt): AttemptPresentation {
  const parsed = parseModelOutput(a.modelOutput, a.attemptType);
  const mo = asRecord(a.modelOutput);
  const ctx = parseClientContext(a.clientContext);

  return {
    isError: parsed.kind === 'error',
    errorMessage: parsed.kind === 'error' ? parsed.data.error : null,
    prediction:
      a.attemptType === 'letter'
        ? strOrNull(mo.predicted_letter)
        : strOrNull(mo.transcription),
    confidence: numOrNull(mo.confidence),
    similarity: numOrNull(mo.similarity),
    message: strOrNull(mo.message),
    model: strOrNull(mo.model),
    variant: strOrNull(mo.variant),
    serverLatencyMs: numOrNull(mo.processing_time_ms) ?? numOrNull(mo.latency_ms),
    clientLatencyMs: ctx ? numOrNull(ctx.apiLatencyMs) : null,
    platform: ctx ? strOrNull(ctx.platform) : null,
    appVersion: ctx ? strOrNull(ctx.appVersion) : null,
    deviceModel: ctx ? strOrNull(ctx.deviceModel) : null,
    recordingDurationMs: ctx ? numOrNull(ctx.recordingDurationMs) : null,
    speechDetected:
      ctx && typeof ctx.speechDetected === 'boolean' ? ctx.speechDetected : null,
    stopReason: ctx ? strOrNull(ctx.stopReason) : null,
  };
}

/** Deterministic UTC timestamp label `YYYY-MM-DD HH:MM` (avoids hydration drift). */
export function formatUtcTimestamp(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}
