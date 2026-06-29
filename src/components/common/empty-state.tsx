import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Props for the {@link EmptyState}. */
export interface EmptyStateProps {
  /** Headline describing the empty/placeholder condition. */
  title: string;
  /** Optional supporting copy (e.g. which phase a feature ships in). */
  description?: string;
  /** Icon to render above the title (defaults to an inbox). */
  icon?: LucideIcon;
  /** Optional action(s) such as a reset-filters button. */
  action?: React.ReactNode;
  /** Additional classes for the wrapper. */
  className?: string;
}

/**
 * Centered placeholder for "no data" or "not-yet-built" surfaces, with an icon,
 * a title, optional description, and an optional action slot.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/40 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
