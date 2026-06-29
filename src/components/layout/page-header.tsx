import * as React from 'react';
import { cn } from '@/lib/utils';

/** Props for the {@link PageHeader}. */
export interface PageHeaderProps {
  /** Primary page title. */
  title: string;
  /** Optional supporting description shown beneath the title. */
  description?: string;
  /** Optional actions rendered on the right (buttons, filters, etc.). */
  actions?: React.ReactNode;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Standard page heading: a strong title, an optional muted description, and an
 * optional right-aligned actions slot. Used at the top of every view's content.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
