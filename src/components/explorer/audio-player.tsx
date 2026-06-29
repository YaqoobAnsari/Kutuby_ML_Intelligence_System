'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Props for {@link AudioPlayer}. */
export interface AudioPlayerProps {
  /** Attempt id used to mint a signed URL via the audio API route. */
  attemptId: string;
  /** Whether a recording exists for this attempt. */
  hasAudio: boolean;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * On-demand audio player. Fetches a short-lived signed URL from
 * `/api/attempts/[id]/audio` only when the user asks to play (never preloaded),
 * then renders a native audio element. Falls back to a retry on failure.
 */
export function AudioPlayer({ attemptId, hasAudio }: AudioPlayerProps): React.ReactElement {
  const [state, setState] = React.useState<LoadState>('idle');
  const [url, setUrl] = React.useState<string | null>(null);

  async function load(): Promise<void> {
    setState('loading');
    try {
      const res = await fetch(`/api/attempts/${attemptId}/audio`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`audio request failed: ${res.status}`);
      const body: unknown = await res.json();
      const signed =
        body !== null && typeof body === 'object'
          ? (body as Record<string, unknown>).url
          : null;
      if (typeof signed !== 'string') throw new Error('no url in response');
      setUrl(signed);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  if (!hasAudio) {
    return <span className="text-xs text-muted-foreground">no audio</span>;
  }

  if (state === 'ready' && url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption -- raw pronunciation clip, no captions exist
    return <audio controls autoPlay src={url} className="h-9 w-64 max-w-full" />;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={load}
      disabled={state === 'loading'}
      className="gap-1.5"
    >
      <Play className="h-3.5 w-3.5" />
      {state === 'loading' ? 'Loading…' : state === 'error' ? 'Retry' : 'Play'}
    </Button>
  );
}
