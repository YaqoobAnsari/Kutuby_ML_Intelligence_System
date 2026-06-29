import { describe, it, expect } from 'vitest';
import { deriveOutcome, summarizeOutcomes } from '@/lib/metrics/outcomes';
import type { Attempt } from '@/types/domain';
import {
  allAttempts,
  errorAttempt,
  letterFailAttempt,
  letterPassAttempt,
} from '../fixtures/attempts';

describe('deriveOutcome', () => {
  it('maps the is_correct taxonomy exactly', () => {
    expect(deriveOutcome(true)).toBe('pass');
    expect(deriveOutcome(false)).toBe('fail');
    expect(deriveOutcome(null)).toBe('error');
  });
});

describe('summarizeOutcomes', () => {
  it('counts and rates the full fixture set', () => {
    const summary = summarizeOutcomes(allAttempts);

    expect(summary.pass).toBe(3);
    expect(summary.fail).toBe(4);
    expect(summary.error).toBe(1);
    expect(summary.total).toBe(8);

    // Rates with errors INCLUDED in the denominator.
    expect(summary.passRate).toBeCloseTo(3 / 8, 10);
    expect(summary.failRate).toBeCloseTo(4 / 8, 10);
    expect(summary.errorRate).toBeCloseTo(1 / 8, 10);

    // Accuracy with errors EXCLUDED from the denominator.
    expect(summary.passRateExclErrors).toBeCloseTo(3 / 7, 10);
  });

  it('keeps the two rate families distinct when errors are present', () => {
    const summary = summarizeOutcomes(allAttempts);
    // passRate uses total (8); passRateExclErrors uses pass+fail (7).
    expect(summary.passRate).not.toBeCloseTo(summary.passRateExclErrors, 6);
  });

  it('returns all-zero rates for empty input (never NaN)', () => {
    const summary = summarizeOutcomes([]);
    expect(summary).toEqual({
      pass: 0,
      fail: 0,
      error: 0,
      total: 0,
      passRate: 0,
      failRate: 0,
      errorRate: 0,
      passRateExclErrors: 0,
    });
  });

  it('handles an all-errors set: errorRate 1, passRateExclErrors 0', () => {
    const summary = summarizeOutcomes([errorAttempt, errorAttempt]);
    expect(summary.error).toBe(2);
    expect(summary.total).toBe(2);
    expect(summary.errorRate).toBe(1);
    expect(summary.passRate).toBe(0);
    expect(summary.failRate).toBe(0);
    // pass + fail === 0 -> guarded to 0 rather than NaN.
    expect(summary.passRateExclErrors).toBe(0);
  });

  it('handles a single passing attempt', () => {
    const summary = summarizeOutcomes([letterPassAttempt]);
    expect(summary.pass).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.passRate).toBe(1);
    expect(summary.passRateExclErrors).toBe(1);
    expect(summary.errorRate).toBe(0);
  });

  it('re-derives outcomes from isCorrect rather than trusting a stale field', () => {
    // outcome says "pass" but isCorrect is false -> must be counted as a FAIL.
    const inconsistent: Attempt = {
      ...letterFailAttempt,
      outcome: 'pass',
      isCorrect: false,
    };
    const summary = summarizeOutcomes([inconsistent]);
    expect(summary.fail).toBe(1);
    expect(summary.pass).toBe(0);
  });
});
