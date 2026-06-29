'use client';

import * as React from 'react';
import { AudioPlayer } from '@/components/explorer/audio-player';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatUtcTimestamp } from '@/lib/attempts/present';
import type { CurationItem } from '@/lib/data/curation';
import type { AttemptOutcome } from '@/types/domain';

/** Human label per outcome (badge variant shares the key). */
const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
  error: 'Error',
};

/** Props for {@link QueueTable}. */
export interface QueueTableProps {
  /** Ranked curation items (highest priority first). */
  items: CurationItem[];
}

/**
 * Ranked review queue: each flagged attempt with its reasons and an inline
 * audio player so a reviewer can listen and judge without leaving the page.
 */
export function QueueTable({ items }: QueueTableProps): React.ReactElement {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-10 text-right">#</TH>
          <TH>Recorded (UTC)</TH>
          <TH>Type</TH>
          <TH>Target</TH>
          <TH>Outcome</TH>
          <TH>Predicted</TH>
          <TH>Reasons</TH>
          <TH>Listen</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((item, i) => (
          <TR key={item.id}>
            <TD className="text-right tabular-nums text-muted-foreground">{i + 1}</TD>
            <TD className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {formatUtcTimestamp(item.recordedAt)}
            </TD>
            <TD>
              <Badge variant="muted" className="capitalize">
                {item.attemptType}
              </Badge>
            </TD>
            <TD className="font-medium">{item.targetLabel}</TD>
            <TD>
              <Badge variant={item.outcome}>{OUTCOME_LABEL[item.outcome]}</Badge>
            </TD>
            <TD className="text-muted-foreground">{item.predicted ?? '—'}</TD>
            <TD>
              <div className="flex flex-wrap gap-1">
                {item.reasons.map((reason) => (
                  <Badge key={reason} variant="outline" className="font-normal">
                    {reason}
                  </Badge>
                ))}
              </div>
            </TD>
            <TD>
              <AudioPlayer attemptId={item.id} hasAudio={item.hasAudio} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
