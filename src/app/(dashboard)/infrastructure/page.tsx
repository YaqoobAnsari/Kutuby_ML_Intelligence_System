import * as React from 'react';
import { HardDrive } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/common/empty-state';

/** Render per-request so this view always reflects live data once shipped. */
export const dynamic = 'force-dynamic';

/**
 * Placeholder for Storage & Infra (Phase 4): recording storage usage, upload
 * reliability, and API latency/ingestion health.
 */
export default function InfrastructurePage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage & Infra"
        description="Recording storage footprint, upload reliability, and verification-API latency and ingestion timing."
      />
      <EmptyState
        icon={HardDrive}
        title="Storage & Infra ships in Phase 4"
        description="Tracks the pronunciation-recordings bucket usage, missing-recording rates, API latency from client_context, and ingestion lag (created_at vs. recorded_at). Audio is never persisted as URLs — only short-lived signed links are minted on demand."
      />
    </div>
  );
}
