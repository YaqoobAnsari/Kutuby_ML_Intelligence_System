'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Pulls the latest data from Supabase on demand. `router.refresh()` re-runs the
 * Server Components for the current route (clearing Next's client router cache),
 * so every panel re-queries the live table. The spinner shows while the new
 * server render streams in.
 */
export function RefreshButton(): React.ReactElement {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} />
      {pending ? 'Refreshing…' : 'Refresh'}
    </Button>
  );
}
