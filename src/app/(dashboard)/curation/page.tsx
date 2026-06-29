import type { ReactElement, ReactNode } from 'react';
import { Download, FileJson } from 'lucide-react';
import { QueueTable } from '@/components/curation/queue-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  buttonVariants,
} from '@/components/ui';
import { getCurationQueue, getExportSummary } from '@/lib/data/curation';
import { cn, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** A labeled stat tile. */
function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

/** A styled download link to the export API. */
function ExportLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a
      href={href}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
    >
      {children}
    </a>
  );
}

/**
 * Data Curation (Phase 5): the prioritized review queue ("what to label / fix /
 * retrain next") and leakage-safe dataset export (train/val/test split, stable
 * per child). Human verdict capture activates once migration 0004 is applied.
 */
export default async function CurationPage(): Promise<ReactElement> {
  try {
    const [queue, summary] = await Promise.all([getCurationQueue(), getExportSummary()]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Data Curation"
          description="Turn the raw attempt log into a retraining asset: a prioritized review queue and a leakage-safe dataset export. The production table stays immutable."
        />

        <Card>
          <CardHeader>
            <CardTitle>Dataset export</CardTitle>
            <CardDescription>
              Every attempt as a manifest row, each tagged with a{' '}
              <strong>train / val / test</strong> split that is stable per child
              (a child&apos;s recordings never straddle splits — no speaker
              leakage). Download CSV or JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Total" value={formatNumber(summary.total)} />
              <Stat label="With audio" value={formatNumber(summary.withAudio)} />
              <Stat label="Train" value={formatNumber(summary.bySplit.train)} />
              <Stat label="Val" value={formatNumber(summary.bySplit.val)} />
              <Stat label="Test" value={formatNumber(summary.bySplit.test)} />
              <Stat
                label="Letters / Words"
                value={`${formatNumber(summary.byType.letter)} / ${formatNumber(summary.byType.word)}`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportLink href="/api/export?format=csv">
                <Download className="h-3.5 w-3.5" />
                All · CSV
              </ExportLink>
              <ExportLink href="/api/export?format=json">
                <FileJson className="h-3.5 w-3.5" />
                All · JSON
              </ExportLink>
              <ExportLink href="/api/export?format=csv&type=letter">
                <Download className="h-3.5 w-3.5" />
                Letters · CSV
              </ExportLink>
              <ExportLink href="/api/export?format=csv&type=word">
                <Download className="h-3.5 w-3.5" />
                Words · CSV
              </ExportLink>
              <ExportLink href="/api/export?format=csv&audio=1">
                <Download className="h-3.5 w-3.5" />
                With-audio only · CSV
              </ExportLink>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>
              {formatNumber(queue.flaggedTotal)} attempts tripped a review
              heuristic. Ranked by priority — the cases most worth a human
              listen before retraining.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {queue.reasonCounts.length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {queue.reasonCounts.map((r) => (
                  <span key={r.label}>
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatNumber(r.value)}
                    </span>{' '}
                    {r.label}
                  </span>
                ))}
              </div>
            )}
            {queue.items.length === 0 ? (
              <EmptyState
                title="Nothing flagged"
                description="No attempts currently trip the review heuristics."
              />
            ) : (
              <div className="-mx-6 border-t">
                <QueueTable items={queue.items} />
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Human verdict capture (confirm / correct the model&apos;s judgment for
          ground-truth labels) activates once migration{' '}
          <code>0004_dashboard_attempt_label.sql</code> is applied to Supabase —
          the production table stays immutable; labels live in our additive table.
        </p>
      </div>
    );
  } catch {
    return (
      <ErrorState
        title="Unable to load curation"
        description="The dashboard data service is unavailable. Check the Supabase configuration and try again."
      />
    );
  }
}
