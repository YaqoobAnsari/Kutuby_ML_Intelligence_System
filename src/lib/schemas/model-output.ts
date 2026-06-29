import { z } from 'zod';

/**
 * Tolerant Zod schemas for the `model_output` jsonb column. Fields evolve, so
 * every schema uses `.passthrough()` to preserve unknown keys.
 */

/** Letter verification API output (.../verify_letter). */
export const LetterOutputSchema = z
  .object({
    result: z.boolean(),
    predicted_letter: z.string().optional(),
    predicted_probability: z.number().optional(),
    target_probability: z.number().optional(),
    confidence: z.number().optional(),
    transcription: z.string().optional(),
    similarity: z.number().optional(),
    message: z.string().optional(),
    processing_time_ms: z.number().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
  })
  .passthrough();

/** Word verification API output (.../verify_word). */
export const WordOutputSchema = z
  .object({
    result: z.boolean(),
    similarity: z.number().optional(),
    confidence: z.number().optional(),
    transcription: z.string().optional(),
    message: z.string().optional(),
    decision_basis: z.string().optional(),
    decision_threshold: z.number().optional(),
    threshold_param_applied: z.boolean().optional(),
  })
  .passthrough();

/** Failure shape: { "error": "<message>" }. */
export const ErrorOutputSchema = z
  .object({
    error: z.string(),
  })
  .passthrough();

/** Union of all known model_output shapes. */
export const ModelOutputSchema = z.union([
  ErrorOutputSchema,
  LetterOutputSchema,
  WordOutputSchema,
]);

/** Inferred type of a letter verification output. */
export type LetterOutput = z.infer<typeof LetterOutputSchema>;
/** Inferred type of a word verification output. */
export type WordOutput = z.infer<typeof WordOutputSchema>;
/** Inferred type of a failure output. */
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;

/**
 * A safe, discriminated result of parsing an unknown `model_output` value.
 * `kind` reflects which tolerant shape matched; `raw` always carries the input.
 */
export type ParsedModelOutput =
  | { kind: 'error'; data: ErrorOutput; raw: unknown }
  | { kind: 'letter'; data: LetterOutput; raw: unknown }
  | { kind: 'word'; data: WordOutput; raw: unknown }
  | { kind: 'unknown'; data: null; raw: unknown };

/**
 * Parse an unknown `model_output` value into a discriminated, safe result.
 * Never throws: unrecognized inputs yield `{ kind: 'unknown' }`.
 *
 * @param value - The raw jsonb value from the row.
 * @param attemptType - Optional hint ("letter"/"word") to disambiguate success
 *   shapes, which are structurally similar.
 */
export function parseModelOutput(
  value: unknown,
  attemptType?: 'letter' | 'word',
): ParsedModelOutput {
  const errorParsed = ErrorOutputSchema.safeParse(value);
  if (errorParsed.success && typeof errorParsed.data.error === 'string') {
    return { kind: 'error', data: errorParsed.data, raw: value };
  }

  // Prefer the type matching the attempt hint when provided.
  if (attemptType === 'word') {
    const word = WordOutputSchema.safeParse(value);
    if (word.success) return { kind: 'word', data: word.data, raw: value };
  }

  const letter = LetterOutputSchema.safeParse(value);
  if (letter.success && hasLetterSignal(letter.data)) {
    return { kind: 'letter', data: letter.data, raw: value };
  }

  const word = WordOutputSchema.safeParse(value);
  if (word.success) {
    return { kind: 'word', data: word.data, raw: value };
  }

  if (letter.success) {
    return { kind: 'letter', data: letter.data, raw: value };
  }

  return { kind: 'unknown', data: null, raw: value };
}

/** Heuristic: does the output carry letter-specific fields? */
function hasLetterSignal(data: LetterOutput): boolean {
  return (
    data.predicted_letter !== undefined ||
    data.predicted_probability !== undefined ||
    data.target_probability !== undefined
  );
}
