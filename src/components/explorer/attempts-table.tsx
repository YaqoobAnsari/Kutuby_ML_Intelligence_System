'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { AttemptDetail } from './attempt-detail';
import { formatUtcTimestamp, presentAttempt } from '@/lib/attempts/present';
import type { Attempt, AttemptOutcome } from '@/types/domain';

/** Human label per outcome (badge variant shares the key). */
const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
  error: 'Error',
};

/** A single attempt row plus its expandable detail. */
function Row({ attempt }: { attempt: Attempt }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const p = presentAttempt(attempt);
  const scoreValue = p.confidence ?? p.similarity;

  return (
    <>
      <TR
        className="cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        data-state={open ? 'selected' : undefined}
      >
        <TD className="w-8 text-muted-foreground">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TD>
        <TD className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {formatUtcTimestamp(attempt.recordedAt)}
        </TD>
        <TD>
          <Badge variant="muted" className="capitalize">
            {attempt.attemptType}
          </Badge>
        </TD>
        <TD className="font-medium">{attempt.targetLabel}</TD>
        <TD>
          <Badge variant={attempt.outcome}>{OUTCOME_LABEL[attempt.outcome]}</Badge>
        </TD>
        <TD className="text-muted-foreground">{p.prediction ?? '—'}</TD>
        <TD className="tabular-nums text-muted-foreground">
          {scoreValue === null ? '—' : scoreValue.toFixed(1)}
        </TD>
        <TD className="tabular-nums text-muted-foreground">
          {p.clientLatencyMs === null ? '—' : `${Math.round(p.clientLatencyMs)} ms`}
        </TD>
      </TR>
      {open && (
        <TR className="hover:bg-transparent">
          <TD colSpan={8} className="p-0">
            <AttemptDetail attempt={attempt} />
          </TD>
        </TR>
      )}
    </>
  );
}

/** Props for {@link AttemptsTable}. */
export interface AttemptsTableProps {
  /** The page of attempts to render (already filtered/paginated server-side). */
  rows: Attempt[];
}

/**
 * Dense, expandable table of attempts. Each row expands to {@link AttemptDetail}
 * (prediction, scores, latency, capture context, audio, raw JSON). Letter and
 * word scores are shown per-row but are NOT comparable across types.
 */
export function AttemptsTable({ rows }: AttemptsTableProps): React.ReactElement {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-8" />
          <TH>Recorded (UTC)</TH>
          <TH>Type</TH>
          <TH>Target</TH>
          <TH>Outcome</TH>
          <TH>Prediction</TH>
          <TH>Score</TH>
          <TH>Latency</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((attempt) => (
          <Row key={attempt.id} attempt={attempt} />
        ))}
      </TBody>
    </Table>
  );
}
