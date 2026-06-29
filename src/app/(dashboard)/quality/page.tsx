import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/common/empty-state';

/** Render per-request so this view always reflects live data once shipped. */
export const dynamic = 'force-dynamic';

/**
 * Placeholder for Dataset Quality (Phase 3): coverage, class balance, missing
 * audio, and other data-health signals.
 */
export default function QualityPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dataset Quality"
        description="Coverage and class balance across targets, missing-audio rates, and other data-health signals that gate model retraining."
      />
      <EmptyState
        icon={ShieldCheck}
        title="Dataset Quality ships in Phase 3"
        description="Surfaces per-target coverage, attempts-with-audio vs. attempts (upload can fail, leaving audio_storage_path null), error-rate hotspots, and class imbalance across the 28 letters and the word vocabulary."
      />
    </div>
  );
}
