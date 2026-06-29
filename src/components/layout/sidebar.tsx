'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain,
  Database,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** A single navigation entry in the sidebar. */
interface NavItem {
  /** Route the entry links to. */
  href: string;
  /** Visible label. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Phase label for not-yet-built sections; omitted when the section is live. */
  phase?: string;
}

/** The six dashboard sections, in canonical order. */
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/explorer', label: 'Dataset Explorer', icon: Database, phase: 'Phase 2' },
  {
    href: '/model-intelligence',
    label: 'Model Intelligence',
    icon: Brain,
    phase: 'Phase 3',
  },
  { href: '/quality', label: 'Dataset Quality', icon: ShieldCheck, phase: 'Phase 3' },
  {
    href: '/infrastructure',
    label: 'Storage & Infra',
    icon: HardDrive,
    phase: 'Phase 4',
  },
  { href: '/curation', label: 'Data Curation', icon: ListChecks, phase: 'Phase 5' },
];

/**
 * Determine whether a nav entry is active for the current pathname.
 * The Overview entry (`/`) matches exactly; others match the route or any nested path.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fixed left navigation rail. Renders the six dashboard sections with active
 * highlighting derived from the current route, and subtly marks sections that
 * ship in a later phase.
 */
export function Sidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          K
        </span>
        <span className="text-sm font-semibold tracking-tight">Kutuby ML</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.phase ? (
                <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {item.phase}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          Internal, read-only ML observability. Children&apos;s audio — handle
          with care.
        </p>
      </div>
    </aside>
  );
}
