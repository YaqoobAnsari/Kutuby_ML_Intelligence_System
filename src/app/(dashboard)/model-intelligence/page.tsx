import * as React from 'react';
import { Brain } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/common/empty-state';

/** Render per-request so this view always reflects live data once shipped. */
export const dynamic = 'force-dynamic';

/**
 * Placeholder for Model Intelligence (Phase 3): per-model performance,
 * confidence/similarity distributions, and confusion analysis.
 */
export default function ModelIntelligencePage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Intelligence"
        description="Per-model accuracy, confidence and similarity distributions, and confusion analysis for the letter and word verifiers."
      />
      <EmptyState
        icon={Brain}
        title="Model Intelligence ships in Phase 3"
        description="Letter and word models are analyzed separately — their confidence scales differ and word confidence is uncalibrated, so metrics are never blended on one axis. Per-attempt model_version is not captured, so version comparison stays disabled until ingestion adds it."
      />
    </div>
  );
}
