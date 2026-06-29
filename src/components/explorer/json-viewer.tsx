import * as React from 'react';

/** Props for {@link JsonViewer}. */
export interface JsonViewerProps {
  /** Summary label for the collapsible section. */
  label: string;
  /** Arbitrary JSON value to pretty-print. */
  value: unknown;
}

/**
 * Collapsible, scrollable pretty-printer for a raw jsonb value (model_output /
 * client_context). Read-only; no client state required.
 */
export function JsonViewer({ label, value }: JsonViewerProps): React.ReactElement {
  return (
    <details className="group rounded-md border bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto border-t px-3 py-2 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
