import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SUPABASE_STORAGE_BUCKET } from '@/lib/supabase/config';
import { createServiceClient } from '@/lib/supabase/service';
import { TABLE } from '@/types/database';

/** Always run dynamically; signed URLs must never be cached or prerendered. */
export const dynamic = 'force-dynamic';

/** Fallback TTL (seconds) when `SIGNED_URL_TTL_SECONDS` is absent/invalid. */
const DEFAULT_TTL_SECONDS = 300;
/** Hard ceiling on signed-URL TTL. */
const MAX_TTL_SECONDS = 900;

/** Tolerant shape for the single column we read from the attempts table. */
const AudioPathRow = z.object({ audio_storage_path: z.string().nullable() });

/** Resolve the signed-URL TTL from env, clamped to `[1, 900]` seconds. */
function resolveTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.SIGNED_URL_TTL_SECONDS ?? '', 10);
  const ttl = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  return Math.min(ttl, MAX_TTL_SECONDS);
}

/**
 * GET `/api/attempts/[id]/audio` — mint a short-lived signed URL for an
 * attempt's recording.
 *
 * Flow: look up the attempt's storage key with the service client -> `404` when
 * there is no audio -> mint a signed URL with a clamped TTL. The service key and
 * raw bucket are never exposed to the client.
 *
 * @returns `{ url, expiresIn }` on success; `404` (no audio) or `502`
 *          (lookup/sign failure) JSON otherwise.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const service = createServiceClient();

  const { data, error } = await service
    .from(TABLE)
    .select('audio_storage_path')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
  }

  const parsed = AudioPathRow.safeParse(data);
  if (!parsed.success || parsed.data.audio_storage_path === null) {
    return NextResponse.json({ error: 'no_audio' }, { status: 404 });
  }

  const targetPath = parsed.data.audio_storage_path;
  const expiresIn = resolveTtlSeconds();

  const signed = await service.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(targetPath, expiresIn);

  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 502 });
  }

  return NextResponse.json(
    { url: signed.data.signedUrl, expiresIn },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
