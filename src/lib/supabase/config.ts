import 'server-only';

/**
 * Single source of Supabase credentials for the dashboard.
 *
 * Auth is intentionally disabled — this is an internal-only tool that reads
 * production data with the service-role key, server-side. Provide credentials
 * either by copying `.env.example` to `.env.local` (recommended) **or** by
 * pasting them directly into the fallbacks below.
 *
 * The service-role key bypasses RLS, so it must NEVER be referenced from a
 * client component — this module is `server-only`.
 */

/** Supabase project URL. Paste between the quotes to hardcode. */
export const SUPABASE_URL: string =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/** Supabase service-role key (RLS-bypassing, server-side only). Paste to hardcode. */
export const SUPABASE_SERVICE_ROLE_KEY: string =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Private bucket holding the WAV pronunciation recordings. */
export const SUPABASE_STORAGE_BUCKET: string =
  process.env.SUPABASE_STORAGE_BUCKET ?? 'pronunciation-recordings';

/** True once URL + service-role key are present (drives a friendly setup notice). */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_SERVICE_ROLE_KEY.length > 0;
}
