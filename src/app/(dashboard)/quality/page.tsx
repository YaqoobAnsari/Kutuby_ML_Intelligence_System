import type { ReactElement } from 'react';
import { AlertTriangle, Mic, MicOff, Smartphone } from 'lucide-react';
import { Histogram } from '@/components/charts/histogram';
import { RankedBarList } from '@/components/charts/ranked-bar-list';
import { KpiCard } from '@/components/overview/kpi-card';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { getDatasetQuality, type LatencyStat } from '@/lib/data/quality';
import { formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Format a latency value (ms) or an em dash. */
function ms(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}ms`;
}

/** Render a latency row (client vs server percentiles) for one attempt type. */
function LatencyRow({ stat }: { stat: LatencyStat }): ReactElement {
  return (
    <TR>
      <TD className="capitalize">{stat.attemptType}</TD>
      <TD className="text-right tabular-nums">{ms(stat.clientP50)}</TD>
      <TD className="text-right tabular-nums">{ms(stat.clientP90)}</TD>
      <TD className="text-right tabular-nums">{ms(stat.serverP50)}</TD>
      <TD className="text-right tabular-nums">{ms(stat.serverP90)}</TD>
    </TR>
  );
}

/**
 * Dataset Quality (Phase 3): capture health, error / no-speech rates, class
 * balance across letters and words, recording-duration shape, latency
 * percentiles (client vs server), and capture-environment breakdowns.
 */
export default async function QualityPage(): Promise<ReactElement> {
  try {
    const data = await getDatasetQuality();
    const { summary } = data;
    const captureRate = summary.total > 0 ? summary.withAudio / summary.total : null;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Dataset Quality"
          description="Is the proprietary dataset clean enough to train on? Capture health, error and no-speech rates, class balance, and recording characteristics."
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Audio capture rate"
            value={formatPercent(captureRate)}
            icon={Mic}
            subtext={`${formatNumber(summary.withAudio)} of ${formatNumber(summary.total)} have audio`}
          />
          <KpiCard
            title="Error rate"
            value={formatPercent(summary.errorRate)}
            icon={AlertTriangle}
            subtext={`${formatNumber(summary.errorCount)} API/network failures`}
          />
          <KpiCard
            title="No-speech rate"
            value={formatPercent(summary.noSpeechRate)}
            icon={MicOff}
            subtext={`${formatNumber(summary.noSpeechCount)} of ${formatNumber(summary.noSpeechDenom)} flagged (letters)`}
          />
          <KpiCard
            title="Simulator captures"
            value={formatNumber(summary.simulatorCount)}
            icon={Smartphone}
            subtext="should be ~0 in production"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Letter class balance</CardTitle>
              <CardDescription>
                Attempts per letter. Imbalance skews retraining — flat is better.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBarList
                data={data.classBalanceLetters.map((c) => ({ name: c.label, value: c.value }))}
                height={Math.max(240, data.classBalanceLetters.length * 22)}
                labelWidth={90}
                format="count"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Word class balance (top 15)</CardTitle>
              <CardDescription>Most-practiced words by attempt volume.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBarList
                data={data.classBalanceWords.map((c) => ({ name: c.label, value: c.value }))}
                height={Math.max(240, data.classBalanceWords.length * 22)}
                labelWidth={110}
                color="hsl(var(--chart-4))"
                format="count"
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recording duration</CardTitle>
              <CardDescription>
                Clip length distribution. Median{' '}
                {data.durationMedianMs === null
                  ? '—'
                  : `${(data.durationMedianMs / 1000).toFixed(1)}s`}
                . Long clips stress the extraction window.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Histogram data={data.durationBins} colorIndex={2} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Latency percentiles</CardTitle>
              <CardDescription>
                Client round-trip (incl. network/cold start) vs. server inference.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH className="text-right">Client p50</TH>
                    <TH className="text-right">Client p90</TH>
                    <TH className="text-right">Server p50</TH>
                    <TH className="text-right">Server p90</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.latency.map((stat) => (
                    <LatencyRow key={stat.attemptType} stat={stat} />
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Platforms</CardTitle>
              <CardDescription>Attempts by capture platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBarList
                data={data.platforms.map((c) => ({ name: c.label, value: c.value }))}
                height={200}
                format="count"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>App versions</CardTitle>
              <CardDescription>Attempts by app version that produced them.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBarList
                data={data.appVersions.map((c) => ({ name: c.label, value: c.value }))}
                height={200}
                color="hsl(var(--chart-3))"
                format="count"
              />
            </CardContent>
          </Card>
        </section>
      </div>
    );
  } catch {
    return (
      <ErrorState
        title="Unable to load dataset quality"
        description="The dashboard data service is unavailable. Check the Supabase configuration and try again."
      />
    );
  }
}
