import type { ReactElement } from 'react';
import { Histogram } from '@/components/charts/histogram';
import { RankedBarList } from '@/components/charts/ranked-bar-list';
import { ConfusionMatrix } from '@/components/intelligence/confusion-matrix';
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
import { getModelIntelligence, type PerModelStats } from '@/lib/data/model-intelligence';
import { formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Title-case an attempt type for headings. */
function modelTitle(type: PerModelStats['attemptType']): string {
  return type === 'letter' ? 'Arabic Letters' : 'Quranic Words';
}

/** One model's summary card (letters and words are never pooled). */
function ModelCard({ stats }: { stats: PerModelStats }): ReactElement {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{modelTitle(stats.attemptType)}</p>
        <span className="text-xs text-muted-foreground">
          {formatNumber(stats.total)} attempts
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {stats.models.length > 0 ? stats.models.join(', ') : 'model not reported'}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-semibold tabular-nums">
            {formatPercent(stats.passRate)}
          </p>
          <p className="text-[11px] text-muted-foreground">pass rate</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">
            {stats.avgConfidence === null ? '—' : stats.avgConfidence.toFixed(1)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {stats.attemptType === 'letter' ? 'avg top-prob' : 'avg conf.'}
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">
            {stats.avgServerLatencyMs === null
              ? '—'
              : `${Math.round(stats.avgServerLatencyMs)}ms`}
          </p>
          <p className="text-[11px] text-muted-foreground">avg infer</p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Model Intelligence (Phase 3): per-model health, the letter confusion matrix,
 * per-class accuracy, per-model confidence distributions (never blended — word
 * confidence is uncalibrated), and the model/variant breakdown.
 */
export default async function ModelIntelligencePage(): Promise<ReactElement> {
  try {
    const data = await getModelIntelligence();
    const letters = data.perModel.find((m) => m.attemptType === 'letter');
    const words = data.perModel.find((m) => m.attemptType === 'word');

    return (
      <div className="space-y-6">
        <PageHeader
          title="Model Intelligence"
          description="How each verifier behaves on real children's audio. Letter and word models are analyzed separately — their confidence scales differ and word confidence is uncalibrated."
        />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {letters && <ModelCard stats={letters} />}
          {words && <ModelCard stats={words} />}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Letter confusion matrix</CardTitle>
            <CardDescription>
              Rows = target letter, columns = predicted letter. Emerald diagonal =
              correct; red off-diagonal = confusions. Opacity scales with the
              within-target share. {formatNumber(data.confusion.totalClassified)}{' '}
              classified letter attempts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfusionMatrix confusion={data.confusion} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-letter pass rate</CardTitle>
            <CardDescription>
              Pass rate per target letter, weakest first. Low bars are the
              letters to prioritize for retraining or threshold review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBarList
              data={data.letterAccuracy.map((l) => ({ name: l.label, value: l.value }))}
              height={Math.max(240, data.letterAccuracy.length * 22)}
              labelWidth={90}
              format="percent"
            />
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Letter confidence</CardTitle>
              <CardDescription>
                Distribution of the model&apos;s top-class probability (%).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Histogram data={data.confidenceLetters} colorIndex={1} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Word confidence</CardTitle>
              <CardDescription>
                Tarteel confidence (0–100). Uncalibrated — interpret shape, not
                absolute thresholds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Histogram data={data.confidenceWords} colorIndex={4} />
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Model &amp; variant usage</CardTitle>
            <CardDescription>
              Serving model and variant per attempt, captured from{' '}
              <code>model_output</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Model</TH>
                  <TH>Variant</TH>
                  <TH className="text-right">Attempts</TH>
                </TR>
              </THead>
              <TBody>
                {data.modelVariants.map((m) => (
                  <TR key={`${m.attemptType}-${m.model}-${m.variant}`}>
                    <TD className="capitalize">{m.attemptType}</TD>
                    <TD className="font-mono text-xs">{m.model}</TD>
                    <TD className="font-mono text-xs">{m.variant}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(m.count)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  } catch {
    return (
      <ErrorState
        title="Unable to load model intelligence"
        description="The dashboard data service is unavailable. Check the Supabase configuration and try again."
      />
    );
  }
}
