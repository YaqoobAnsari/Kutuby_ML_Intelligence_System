import { describe, it, expect } from 'vitest';
import {
  groupBySession,
  retryDistribution,
  sessionStats,
} from '@/lib/metrics/sessions';
import {
  allAttempts,
  letterPassAttempt,
  multiSessionAttempts,
} from '../fixtures/attempts';

describe('groupBySession', () => {
  it('groups attempts by sessionId', () => {
    const groups = groupBySession(allAttempts);
    expect(groups.size).toBe(6);
    expect(groups.get('pron-1782121407706-ffffff')).toHaveLength(3);
    expect(groups.get('pron-1782121407706-aaaaaa')).toHaveLength(1);
  });

  it('sorts each session ascending by attemptNumber', () => {
    const reversed = [...multiSessionAttempts].reverse();
    const groups = groupBySession(reversed);
    const session = groups.get('pron-1782121407706-ffffff');
    expect(session?.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
  });

  it('returns an empty map for empty input', () => {
    expect(groupBySession([]).size).toBe(0);
  });
});

describe('sessionStats', () => {
  it('computes counts and averages over the fixture set', () => {
    const stats = sessionStats(allAttempts);
    expect(stats.totalSessions).toBe(6);
    expect(stats.avgAttemptsPerSession).toBeCloseTo(8 / 6, 10);
  });

  it('treats "resolved" as containing at least one PASS, by depth', () => {
    const stats = sessionStats(allAttempts);
    // Resolved within 1: aaaaaa, cccccc (2 of 6).
    expect(stats.pctResolvedWithin1).toBeCloseTo(2 / 6, 10);
    // The 3-attempt session resolves only at attempt 3.
    expect(stats.pctResolvedWithinN(2)).toBeCloseTo(2 / 6, 10);
    expect(stats.pctResolvedWithinN(3)).toBeCloseTo(3 / 6, 10);
    // No further sessions resolve beyond depth 3.
    expect(stats.pctResolvedWithinN(99)).toBeCloseTo(3 / 6, 10);
  });

  it('returns 0 for non-positive resolution depths', () => {
    const stats = sessionStats(allAttempts);
    expect(stats.pctResolvedWithinN(0)).toBe(0);
    expect(stats.pctResolvedWithinN(-3)).toBe(0);
  });

  it('handles a single passing session', () => {
    const stats = sessionStats([letterPassAttempt]);
    expect(stats.totalSessions).toBe(1);
    expect(stats.avgAttemptsPerSession).toBe(1);
    expect(stats.pctResolvedWithin1).toBe(1);
  });

  it('handles a single multi-attempt session resolved on attempt 3', () => {
    const stats = sessionStats(multiSessionAttempts);
    expect(stats.totalSessions).toBe(1);
    expect(stats.avgAttemptsPerSession).toBe(3);
    expect(stats.pctResolvedWithin1).toBe(0);
    expect(stats.pctResolvedWithinN(3)).toBe(1);
  });

  it('returns zeros for empty input (never NaN)', () => {
    const stats = sessionStats([]);
    expect(stats.totalSessions).toBe(0);
    expect(stats.avgAttemptsPerSession).toBe(0);
    expect(stats.pctResolvedWithin1).toBe(0);
    expect(stats.pctResolvedWithinN(5)).toBe(0);
  });
});

describe('retryDistribution', () => {
  it('counts sessions by their attempt count', () => {
    const distribution = retryDistribution(allAttempts);
    expect(distribution.get(1)).toBe(5);
    expect(distribution.get(3)).toBe(1);
    expect(distribution.get(2)).toBeUndefined();
  });

  it('returns an empty map for empty input', () => {
    expect(retryDistribution([]).size).toBe(0);
  });
});
