import { type ClassValue, clsx } from 'clsx';
import { format } from 'date-fns';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with locale-aware thousands separators.
 * @param value - The number to format (null/undefined render as an em dash).
 * @param fractionDigits - Maximum fraction digits (default 0).
 */
export function formatNumber(
  value: number | null | undefined,
  fractionDigits = 0,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Format a 0..1 ratio as a percentage string (e.g. 0.823 -> "82.3%").
 * @param ratio - Ratio in the 0..1 range (null/undefined render as an em dash).
 * @param fractionDigits - Fraction digits to show (default 1).
 */
export function formatPercent(
  ratio: number | null | undefined,
  fractionDigits = 1,
): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/**
 * Format a date/ISO string as a short, human-friendly label (e.g. "29 Jun 2026").
 * @param value - A Date, ISO string, or epoch millis (invalid input renders an em dash).
 */
export function formatDateShort(
  value: Date | string | number | null | undefined,
): string {
  if (value === null || value === undefined) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd MMM yyyy');
}
