/**
 * Public barrel for the design-system layer. Re-exports the shadcn-style UI
 * primitives plus the shared presentational helpers (page header, empty/error
 * states, loading and skeleton placeholders) used across views.
 */
export * from './badge';
export * from './button';
export * from './card';
export * from './dropdown-menu';
export * from './input';
export * from './label';
export * from './select';
export * from './separator';
export * from './skeleton';
export * from './table';
export * from './tabs';
export * from './tooltip';

export * from '@/components/layout/page-header';
export * from '@/components/common/empty-state';
export * from '@/components/common/error-state';
export * from '@/components/common/loading';
export * from '@/components/common/stat-skeleton';
