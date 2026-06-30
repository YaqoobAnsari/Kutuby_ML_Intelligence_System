import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_URL,
} from '@/lib/supabase/config';
import { createServiceClient } from '@/lib/supabase/service';
import { TABLE } from '@/types/database';

/** Always run dynamically; audio is served per-request, never cached. */
export const dynamic = 'force-dynamic';

/** Tolerant shape for the single column we read from the attempts table. */
const AudioPathRow = z.object({ audio_storage_path: z.string().nullable() });

/**
 * Resolve an HTTP `Range` header against a known total size.
 * Handles `bytes=N-M`, `bytes=N-`, and suffix `bytes=-S`.
 * @returns The inclusive `[start, end]` byte range, or `null` when the header is
 *          absent/unparseable/unsatisfiable (caller serves the full body).
 */
function resolveRange(header: string | null, total: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return null;

  let start: number;
  let end: number;
  if (!hasStart) {
    start = Math.max(0, total - Number(match[2]));
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Math.min(Number(match[2]), total - 1) : total - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
    return null;
  }
  return { start, end };
}

/**
 * GET `/api/attempts/[id]/audio` — serve an attempt's recording from OUR origin.
 *
 * The file is fetched once with the server-side service key and returned as a
 * fully-buffered body with an exact `Content-Length` (no chunked encoding, which
 * some browsers refuse to decode for media) and proper `Range`/`206` support so
 * the `<audio>` element can seek. No cross-origin request reaches the browser.
 *
 * @returns Audio bytes (`200`/`206`, `audio/wav`); `404` (no audio) or `502`
 *          (lookup/upstream failure).
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

  const encodedPath = parsed.data.audio_storage_path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const upstream = await fetch(
    `${SUPABASE_URL}/storage/v1/object/authenticated/${SUPABASE_STORAGE_BUCKET}/${encodedPath}`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    },
  );
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'upstream_failed', status: upstream.status },
      { status: 502 },
    );
  }

  const full = new Uint8Array(await upstream.arrayBuffer());
  const total = full.length;
  const contentType = upstream.headers.get('content-type') ?? 'audio/wav';

  const range = resolveRange(request.headers.get('range'), total);
  if (range) {
    const chunk = full.slice(range.start, range.end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(full, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}
