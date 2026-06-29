/**
 * Hand-written, read-only TypeScript types mirroring the immutable production
 * table `public.child_pronunciation_attempt`. This table is NEVER written to by
 * the dashboard.
 */

/** Canonical table name for the raw production attempts table. */
export const TABLE = 'child_pronunciation_attempt' as const;

/**
 * One row of `public.child_pronunciation_attempt` — one verification call.
 * Retries share `session_id` and increment `attempt_number`.
 *
 * Column nullability matches the production schema exactly.
 */
export interface ChildPronunciationAttemptRow {
  /** uuid PK. */
  id: string;
  /** uuid FK -> child_user.id. */
  child_id: string;
  /** Groups retries within a lesson step (e.g. "pron-1782121407706-vvlecr"). */
  session_id: string;
  /** 1-based index of the attempt within its session. */
  attempt_number: number;
  /** "letter" | "word" (kept as string; domain layer narrows it). */
  attempt_type: string;
  /** UI glyph or word shown to the child (nullable). */
  target_display: string | null;
  /** Canonical grouping key: letter label (e.g. "Alif") or the word string. */
  target_sent_to_api: string;
  /** Parsed from the model "result"; NULL on API/network error. */
  is_correct: boolean | null;
  /** Raw verification API response, or { "error": "..." } on failure. */
  model_output: unknown;
  /** App-side metadata captured at request time. */
  client_context: unknown;
  /** Storage KEY (not a URL); NULL if the upload failed. */
  audio_storage_path: string | null;
  /** When the attempt was recorded (behavioral time-series source). */
  recorded_at: string;
  /** Row insert time (ingestion timing source). */
  created_at: string;
}
