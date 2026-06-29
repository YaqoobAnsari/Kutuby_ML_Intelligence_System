'use client';

import * as React from 'react';
import { AudioPlayer } from './audio-player';
import { JsonViewer } from './json-viewer';
import { presentAttempt } from '@/lib/attempts/present';
import type { Attempt } from '@/types/domain';

/** A single labeled field in the detail grid. */
function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value ?? '—'}</dd>
    </div>
  );
}

/** Format a millisecond duration, or em dash when absent. */
function ms(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)} ms`;
}

/** Format a numeric score to one decimal, or em dash. */
function score(v: number | null): string {
  return v === null ? '—' : v.toFixed(1);
}

/** Props for {@link AttemptDetail}. */
export interface AttemptDetailProps {
  /** The attempt to expand. */
  attempt: Attempt;
}

/**
 * Expanded per-attempt detail: prediction, per-model scores (never compared
 * across types), latency split (server vs client), capture context, the audio
 * player, and the raw `model_output` / `client_context` for full transparency.
 */
export function AttemptDetail({ attempt }: AttemptDetailProps): React.ReactElement {
  const p = presentAttempt(attempt);
  const isLetter = attempt.attemptType === 'letter';

  return (
    <div className="space-y-4 bg-muted/20 p-4">
      {p.isError && (
        <div className="rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          API/network error (counted as <strong>error</strong>, not a model miss):{' '}
          {p.errorMessage ?? 'unknown'}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Target" value={attempt.targetLabel} />
        <Field label="Sent to API" value={attempt.targetSentToApi} />
        <Field label="Prediction" value={p.prediction} />
        <Field
          label={isLetter ? 'Confidence (target %)' : 'Confidence (0–100)'}
          value={score(p.confidence)}
        />
        <Field label="Similarity" value={score(p.similarity)} />
        <Field label="Model" value={p.model} />
        <Field label="Variant" value={p.variant} />
        <Field label="Server latency" value={ms(p.serverLatencyMs)} />
        <Field label="Client latency" value={ms(p.clientLatencyMs)} />
        <Field label="Recording" value={ms(p.recordingDurationMs)} />
        <Field
          label="Speech detected"
          value={p.speechDetected === null ? '—' : p.speechDetected ? 'yes' : 'no'}
        />
        <Field label="Stop reason" value={p.stopReason} />
        <Field label="Platform" value={p.platform} />
        <Field label="App version" value={p.appVersion} />
        <Field label="Device" value={p.deviceModel} />
        <Field label="Session" value={`${attempt.sessionId} · #${attempt.attemptNumber}`} />
      </dl>

      {p.message && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Message: </span>
          {p.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Recording
        </span>
        <AudioPlayer attemptId={attempt.id} hasAudio={attempt.hasAudio} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <JsonViewer label="model_output (raw)" value={attempt.modelOutput} />
        <JsonViewer label="client_context (raw)" value={attempt.clientContext} />
      </div>
    </div>
  );
}
