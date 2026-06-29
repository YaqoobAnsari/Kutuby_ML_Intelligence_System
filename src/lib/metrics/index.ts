/**
 * Barrel for the pure metrics helpers (outcomes, sessions, confidence).
 *
 * These functions are framework-agnostic and contain no I/O, so they are safe
 * to import from both server and client modules. Import the taxonomy-aware
 * outcome helpers, session/retry aggregation, and per-model confidence
 * extraction from here rather than reaching into individual files.
 */
export * from '@/lib/metrics/outcomes';
export * from '@/lib/metrics/sessions';
export * from '@/lib/metrics/confidence';
