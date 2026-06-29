import { z } from 'zod';

/**
 * Tolerant Zod schema for the `client_context` jsonb column. All fields are
 * optional and unknown keys are preserved via `.passthrough()`.
 */
export const ClientContextSchema = z
  .object({
    endpoint: z.string().optional(),
    httpStatus: z.number().optional(),
    apiLatencyMs: z.number().optional(),
    targetTextApp: z.string().optional(),
    requestPayload: z
      .object({
        target_letter: z.string().optional(),
        target_word: z.string().optional(),
        // The app sends these as strings ("0.6", "true"); accept either form.
        threshold: z.union([z.number(), z.string()]).optional(),
        fuzzy_match: z.union([z.boolean(), z.string()]).optional(),
        fuzzy_threshold: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .optional(),
    recordingDurationMs: z.number().optional(),
    speechDetected: z.boolean().optional(),
    peakMeteringDb: z.number().optional(),
    stopReason: z.string().optional(),
    platform: z.string().optional(),
    appVersion: z.string().optional(),
    deviceModel: z.string().optional(),
    isRealDevice: z.boolean().optional(),
    isSimulator: z.boolean().optional(),
  })
  .passthrough();

/** Inferred type of a parsed client context. */
export type ClientContext = z.infer<typeof ClientContextSchema>;

/**
 * Safely parse an unknown `client_context` value.
 * @returns The parsed context, or `null` when the value is not an object.
 */
export function parseClientContext(value: unknown): ClientContext | null {
  const parsed = ClientContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
