import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Hard upper bound for signed-URL TTL (seconds). Governance decision #4 caps
 * children's-audio signed URLs at 15 minutes regardless of env configuration.
 */
const MAX_TTL_SECONDS = 900;

/** Fallback bucket when `SUPABASE_STORAGE_BUCKET` is not set (see INTEGRATIONS). */
const DEFAULT_BUCKET = 'pronunciation-recordings';

/**
 * Typed error raised when a playable URL cannot be produced (empty path, missing
 * configuration, or a storage-backend failure). Pages catch this and render a
 * graceful "audio unavailable" state.
 */
export class SignedUrlError extends Error {
  /** Discriminant name for `instanceof`-free checks across module boundaries. */
  public readonly name = 'SignedUrlError';

  /**
   * @param message - Human-readable reason (never contains a signed URL).
   * @param cause - Optional underlying error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Resolve the private storage bucket name (defaults to the recordings bucket). */
function resolveBucket(): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  return bucket && bucket.length > 0 ? bucket : DEFAULT_BUCKET;
}

/**
 * Resolve the signed-URL TTL from `SIGNED_URL_TTL_SECONDS`, clamped to
 * `(0, 900]`. Invalid or missing values fall back to the 900s maximum.
 */
function resolveTtlSeconds(): number {
  const raw = process.env.SIGNED_URL_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : MAX_TTL_SECONDS;
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_TTL_SECONDS;
  return Math.min(parsed, MAX_TTL_SECONDS);
}

/**
 * Mint a short-lived, server-side signed URL for a recording's storage key.
 *
 * This is the single abstraction over the storage backend so it can change
 * later without touching callers. The URL TTL is clamped to <= 900s and the URL
 * is returned for immediate use only — it is NEVER persisted, cached, or logged.
 * Authorization (analyst/admin) and the `play_audio` audit entry are the
 * caller's responsibility (route handler), per the security model.
 *
 * @param path - The storage KEY (e.g. `{child_id}/{session_id}/{n}.wav`).
 * @returns A signed, time-limited URL string.
 * @throws {SignedUrlError} If `path` is empty or the URL cannot be minted.
 */
export async function getPlayableUrl(path: string): Promise<string> {
  noStore();

  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new SignedUrlError('audio storage path is empty');
  }

  const bucket = resolveBucket();
  const ttl = resolveTtlSeconds();

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttl);

  if (error || !data?.signedUrl) {
    throw new SignedUrlError(
      `failed to mint signed URL for the requested recording`,
      { cause: error ?? undefined },
    );
  }

  return data.signedUrl;
}
