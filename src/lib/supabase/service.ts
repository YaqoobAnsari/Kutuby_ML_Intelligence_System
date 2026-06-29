import 'server-only';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

/**
 * Create a Supabase **service-role** client that bypasses RLS.
 *
 * This is the dashboard's only data client — there is no end-user auth. It
 * grants full read of the production table and the private audio bucket, so it
 * is restricted to `import 'server-only'` modules; a stray client import fails
 * the build. Credentials come from {@link SUPABASE_URL} / {@link SUPABASE_SERVICE_ROLE_KEY}
 * (see `src/lib/supabase/config.ts`). Session persistence/refresh are disabled.
 *
 * @returns A service-role Supabase client (RLS-bypassing, no session).
 * @throws Error when the URL or service-role key are absent.
 */
export function createServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local, or hardcode them in ' +
        'src/lib/supabase/config.ts.',
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
