import { format, subDays } from 'date-fns';
import { Activity, AlertTriangle, CheckCircle2, Mic, TrendingUp } from 'lucide-react';
import type { ReactElement } from 'react';
import { CaptureHealth } from '@/components/overview/capture-health';
import { GrowthChart } from '@/components/overview/growth-chart';
import { KpiCard } from '@/components/overview/kpi-card';
import { OutcomeBreakdown } from '@/components/overview/outcome-breakdown';
import { WeakTargets } from '@/components/overview/weak-targets';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
} from '@/components/ui';
import { getOverviewData } from '@/lib/data/overview';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { DailyPoint } from '@/types/domain';

/**
 * Always render at request time. This keeps the service-role data fetch out of
 * the build: a missing/invalid env at build time can never execute this page,
 * and a runtime fetch failure degrades to an error state instead of crashing.
 */
export const dynamic = 'force-dynamic';

/**
 * Sum attempts recorded within the trailing 7 calendar days (inclusive of
 * today), derived from the daily series so it shares the chart's time semantics.
 */
function attemptsInLast7Days(daily: DailyPoint[]): number {
  const cutoff = format(subDays(new Date(), 6), 'yyyy-MM-dd');
  return (daily ?? [])
    .filter((point) => point.date >= cutoff)
    .reduce((sum, point) => sum + point.total, 0);
}

/**
 * Executive Overview (Phase 1): headline KPIs, daily growth, the outcome
 * breakdown, and the weakest letters/words. Aggregates only (viewer-safe) and
 * reliable fields only — no model version, no blended cross-model confidence.
 */
export default async function OverviewPage(): Promise<ReactElement> {
  try {
    const { metrics, daily, weakLetters, weakWords } = await getOverviewData();

    const total = metrics.totalAttempts;
    const breakdown = {
      pass: metrics.passCount,
      fail: metrics.failCount,
      error: metrics.errorCount,
      total: metrics.passCount + metrics.failCount + metrics.errorCount,
    };
    const last7d = attemptsInLast7Days(daily);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Executive Overview"
          description="Pronunciation-model health at a glance: practice volume, capture health, model outcomes, and the weakest targets. Aggregates only."
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Total attempts"
            value={formatNumber(total)}
            icon={Activity}
            subtext={`${formatNumber(metrics.uniqueChildren)} children · ${formatNumber(metrics.totalSessions)} sessions`}
          />
          <KpiCard
            title="Attempts with audio"
            value={formatNumber(metrics.attemptsWithAudio)}
            icon={Mic}
          >
            <CaptureHealth total={total} withAudio={metrics.attemptsWithAudio} />
          </KpiCard>
          <KpiCard
            title="Pass rate"
            value={formatPercent(metrics.passRate)}
            icon={CheckCircle2}
            subtext="of scored attempts (excludes errors)"
          />
          <KpiCard
            title="Error rate"
            value={formatPercent(metrics.errorRate)}
            icon={AlertTriangle}
            subtext="of all attempts (API/network)"
          />
          <KpiCard
            title="Attempts · last 7d"
            value={formatNumber(last7d)}
            icon={TrendingUp}
            subtext="by recorded date"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Daily practice volume</CardTitle>
            <CardDescription>
              Total attempts per day, bucketed on recorded_at (when children
              practiced).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GrowthChart data={daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome breakdown</CardTitle>
            <CardDescription>
              Pass / fail / error across all attempts. Error is an API/network
              failure, not a model miss — it is never folded into fail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OutcomeBreakdown breakdown={breakdown} />
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WeakTargets
            title="Weakest letters"
            description="Ranked by combined fail + error rate; attempt volume in parentheses."
            data={weakLetters}
          />
          <WeakTargets
            title="Weakest words"
            description="Ranked by combined fail + error rate; attempt volume in parentheses."
            data={weakWords}
          />
        </section>
      </div>
    );
  } catch {
    return (
      <ErrorState
        title="Unable to load the overview"
        description="The dashboard data service is unavailable. Check the server configuration and try again."
      />
    );
  }
}
