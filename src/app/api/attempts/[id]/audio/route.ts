import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_URL,
} from '@/lib/supabase/config';
import { createServiceClient } from '@/lib/supabase/service';
import { TABLE } from '@/types/database';

/** Always run dynamically; audio is streamed per-request, never cached. */
export const dynamic = 'force-dynamic';

/** Tolerant shape for the single column we read from the attempts table. */
const AudioPathRow = z.object({ audio_storage_path: z.string().nullable() });

/** Headers worth forwarding from the storage response to the client. */
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

/**
 * GET `/api/attempts/[id]/audio` — stream an attempt's recording from OUR origin.
 *
 * Rather than handing the browser a cross-origin Supabase signed URL (which can
 * be blocked by privacy/ad blockers and complicates autoplay), this proxies the
 * bytes through the dashboard's own origin. The service key stays server-side;
 * `Range` requests are forwarded so the `<audio>` element can seek.
 *
 * @returns The audio bytes (`200`/`206`, `audio/wav`); `404` when there is no
 *          audio; `502` on lookup/upstream failure.
 */
export async function GET(
  request: NextRequest,
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

  // Encode each path segment but keep the slash separators.
  const encodedPath = parsed.data.audio_storage_path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const upstreamUrl = `${SUPABASE_URL}/storage/v1/object/authenticated/${SUPABASE_STORAGE_BUCKET}/${encodedPath}`;

  const range = request.headers.get('range');
  const upstream = await fetch(upstreamUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(range ? { Range: range } : {}),
    },
    cache: 'no-store',
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: 'upstream_failed', status: upstream.status },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'audio/wav');
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
