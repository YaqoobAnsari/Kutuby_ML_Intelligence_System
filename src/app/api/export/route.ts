import { type NextRequest, NextResponse } from 'next/server';
import {
  buildExportRows,
  type ExportFilters,
  type ExportRow,
} from '@/lib/data/curation';
import type { AttemptOutcome, AttemptType } from '@/types/domain';

/** Always dynamic; exports reflect the live dataset. */
export const dynamic = 'force-dynamic';

/** Column order for the CSV export. */
const COLUMNS: (keyof ExportRow)[] = [
  'id',
  'child_id',
  'session_id',
  'attempt_number',
  'attempt_type',
  'target',
  'target_display',
  'outcome',
  'is_correct',
  'predicted',
  'confidence',
  'similarity',
  'model',
  'variant',
  'audio_path',
  'recorded_at',
  'split',
];

/** Quote/escape a single CSV field. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV text. */
function toCsv(rows: ExportRow[]): string {
  const header = COLUMNS.join(',');
  const body = rows.map((row) => COLUMNS.map((col) => csvCell(row[col])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

const TYPES: readonly AttemptType[] = ['letter', 'word'];
const OUTCOMES: readonly AttemptOutcome[] = ['pass', 'fail', 'error'];

/**
 * GET `/api/export` — download the curated dataset manifest.
 *
 * Query params: `format` (`csv` default | `json`), `type` (`letter`|`word`),
 * `outcome` (`pass`|`fail`|`error`), `audio` (`1` = with-audio only). Each row
 * carries a leakage-safe `split` (train/val/test, stable per child).
 *
 * @returns A downloadable CSV or JSON attachment.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') === 'json' ? 'json' : 'csv';
  const typeRaw = searchParams.get('type');
  const outcomeRaw = searchParams.get('outcome');

  const filters: ExportFilters = {
    attemptType: TYPES.includes(typeRaw as AttemptType) ? (typeRaw as AttemptType) : undefined,
    outcome: OUTCOMES.includes(outcomeRaw as AttemptOutcome)
      ? (outcomeRaw as AttemptOutcome)
      : undefined,
    withAudioOnly: searchParams.get('audio') === '1',
  };

  try {
    const rows = await buildExportRows(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = filters.attemptType ?? 'all';
    const base = `kutuby-dataset-${scope}-${stamp}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify({ count: rows.length, rows }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${base}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'export_failed' }, { status: 502 });
  }
}
