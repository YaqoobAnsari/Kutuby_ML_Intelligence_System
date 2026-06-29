import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for the {@link ErrorState}. */
export interface ErrorStateProps {
  /** Headline describing the failure (defaults to a generic message). */
  title?: string;
  /** Optional supporting detail (a sanitized error message). */
  description?: string;
  /** Optional action such as a retry button. */
  action?: React.ReactNode;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Centered error surface with a warning icon, a title, optional detail, and an
 * optional action slot (e.g. retry).
 */
export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: ErrorStateProps): React.ReactElement {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-destructive">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
