import * as React from 'react';
import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/common/empty-state';

/** Render per-request so this view always reflects live data once shipped. */
export const dynamic = 'force-dynamic';

/**
 * Placeholder for Data Curation (Phase 5): building review queues and curated
 * sets for retraining, fully audited and read-only against production.
 */
export default function CurationPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Curation"
        description="Assemble review queues and curated example sets for model retraining — read-only against production and fully audited."
      />
      <EmptyState
        icon={ListChecks}
        title="Data Curation ships in Phase 5"
        description="Lets analysts flag and group attempts into curated sets for retraining. The raw child_pronunciation_attempt table stays immutable; curation metadata lives in our own additive tables, and every selection and export is recorded in the audit log."
      />
    </div>
  );
}
