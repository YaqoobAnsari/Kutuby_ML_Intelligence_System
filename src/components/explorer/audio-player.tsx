'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Props for {@link AudioPlayer}. */
export interface AudioPlayerProps {
  /** Attempt id used to stream the recording from our own origin. */
  attemptId: string;
  /** Whether a recording exists for this attempt. */
  hasAudio: boolean;
}

/**
 * On-demand audio player. The recording streams from the dashboard's OWN origin
 * (`/api/attempts/[id]/audio`), so there is no cross-origin media request to be
 * blocked by privacy/ad blockers. The `<audio>` element is mounted synchronously
 * on click, preserving the user gesture so autoplay is allowed. A fallback
 * "open" link covers any element-level failure.
 */
export function AudioPlayer({ attemptId, hasAudio }: AudioPlayerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  if (!hasAudio) {
    return <span className="text-xs text-muted-foreground">no audio</span>;
  }

  const src = `/api/attempts/${attemptId}/audio`;

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Play className="h-3.5 w-3.5" />
        Play
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- raw pronunciation clip, no captions exist */}
      <audio
        controls
        autoPlay
        preload="metadata"
        src={src}
        onError={() => setFailed(true)}
        className="h-9 w-56 max-w-full"
      />
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground underline"
      >
        {failed ? 'failed — open' : 'open'}
      </a>
    </div>
  );
}
