import 'server-only';
import { scanEnrichedAttempts, type EnrichedAttempt } from '@/lib/data/enriched';
import { isLetterLabel, labelToArabic } from '@/lib/letters/mapping';
import type { AttemptType } from '@/types/domain';

/** A labeled count (for ranked bars / breakdowns). */
export interface CountStat {
  label: string;
  value: number;
}

/** Headline data-quality summary. */
export interface QualitySummary {
  total: number;
  withAudio: number;
  /** Fraction of attempts missing audio in `[0,1]`. */
  nullAudioPct: number;
  errorCount: number;
  /** ERROR / total in `[0,1]`. */
  errorRate: number;
  /** Letter attempts flagged `no_speech`. */
  noSpeechCount: number;
  /** Letter attempts that reported a `no_speech` flag at all. */
  noSpeechDenom: number;
  /** noSpeechCount / noSpeechDenom in `[0,1]`; null when no signal. */
  noSpeechRate: number | null;
  /** Attempts captured on a simulator (should be ~0 in production). */
  simulatorCount: number;
}

/** Client/server latency percentiles for one attempt type. */
export interface LatencyStat {
  attemptType: AttemptType;
  clientP50: number | null;
  clientP90: number | null;
  serverP50: number | null;
  serverP90: number | null;
}

/** Everything the Dataset Quality page renders. */
export interface DatasetQuality {
  summary: QualitySummary;
  classBalanceLetters: CountStat[];
  classBalanceWords: CountStat[];
  durationBins: { label: string; count: number }[];
  durationMedianMs: number | null;
  latency: LatencyStat[];
  platforms: CountStat[];
  appVersions: CountStat[];
}

/** p-th percentile (0–100) of a numeric sample, or null when empty. */
function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** Count occurrences of a string-valued accessor, ranked desc, top `limit`. */
function countBy(
  rows: EnrichedAttempt[],
  get: (r: EnrichedAttempt) => string | null,
  limit = 12,
): CountStat[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = get(r);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Latency percentiles for one attempt type. */
function latencyFor(rows: EnrichedAttempt[], attemptType: AttemptType): LatencyStat {
  const subset = rows.filter((r) => r.attemptType === attemptType);
  const client = subset.map((r) => r.clientLatencyMs).filter((v): v is number => v !== null);
  const server = subset.map((r) => r.serverLatencyMs).filter((v): v is number => v !== null);
  return {
    attemptType,
    clientP50: percentile(client, 50),
    clientP90: percentile(client, 90),
    serverP50: percentile(server, 50),
    serverP90: percentile(server, 90),
  };
}

/** Bucket recording durations into second-wide bins (0–1 … 5+). */
function durationBins(rows: EnrichedAttempt[]): { label: string; count: number }[] {
  const labels = ['0–1s', '1–2s', '2–3s', '3–4s', '4–5s', '5s+'];
  const bins = labels.map((label) => ({ label, count: 0 }));
  for (const r of rows) {
    if (r.recordingDurationMs === null) continue;
    const sec = r.recordingDurationMs / 1000;
    const idx = Math.min(5, Math.max(0, Math.floor(sec)));
    bins[idx].count += 1;
  }
  return bins;
}

/**
 * Compute the Dataset Quality page payload from a single enriched scan: capture
 * health, error and no-speech rates, class balance, recording-duration shape,
 * latency percentiles (client vs server), and platform/app-version breakdowns.
 * Dynamic (never cached).
 *
 * @returns The {@link DatasetQuality} payload.
 * @throws {DashboardDataError} On query failure or missing configuration.
 */
export async function getDatasetQuality(): Promise<DatasetQuality> {
  const rows = await scanEnrichedAttempts();

  const total = rows.length;
  const withAudio = rows.filter((r) => r.hasAudio).length;
  const errorCount = rows.filter((r) => r.outcome === 'error').length;
  const noSpeechRows = rows.filter((r) => r.noSpeech !== null);
  const noSpeechCount = noSpeechRows.filter((r) => r.noSpeech === true).length;
  const simulatorCount = rows.filter((r) => r.isSimulator === true).length;

  const durationMs = rows
    .map((r) => r.recordingDurationMs)
    .filter((v): v is number => v !== null);

  return {
    summary: {
      total,
      withAudio,
      nullAudioPct: total > 0 ? (total - withAudio) / total : 0,
      errorCount,
      errorRate: total > 0 ? errorCount / total : 0,
      noSpeechCount,
      noSpeechDenom: noSpeechRows.length,
      noSpeechRate: noSpeechRows.length > 0 ? noSpeechCount / noSpeechRows.length : null,
      simulatorCount,
    },
    classBalanceLetters: countBy(
      rows.filter((r) => r.attemptType === 'letter' && isLetterLabel(r.target)),
      (r) => `${labelToArabic(r.target) ?? ''} ${r.target}`.trim(),
      28,
    ),
    classBalanceWords: countBy(
      rows.filter((r) => r.attemptType === 'word'),
      (r) => r.target,
      15,
    ),
    durationBins: durationBins(rows),
    durationMedianMs: percentile(durationMs, 50),
    latency: [latencyFor(rows, 'letter'), latencyFor(rows, 'word')],
    platforms: countBy(rows, (r) => r.platform),
    appVersions: countBy(rows, (r) => r.appVersion),
  };
}
