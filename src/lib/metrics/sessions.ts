import type { Attempt } from '@/types/domain';
import { deriveOutcome } from '@/lib/metrics/outcomes';

/**
 * Group attempts by their `sessionId`. Each session's attempts are sorted by
 * `attemptNumber` ascending for deterministic downstream iteration.
 *
 * A "session" is a single lesson step in which a child may retry the same target
 * multiple times; retries share the `sessionId` and increment `attemptNumber`.
 *
 * @param attempts - Attempts in scope (not mutated; copies are sorted).
 * @returns Map of `sessionId` -> that session's attempts, ascending by attempt number.
 */
export function groupBySession(
  attempts: readonly Attempt[],
): Map<string, Attempt[]> {
  const sessions = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const existing = sessions.get(attempt.sessionId);
    if (existing) existing.push(attempt);
    else sessions.set(attempt.sessionId, [attempt]);
  }
  for (const list of sessions.values()) {
    list.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }
  return sessions;
}

/**
 * Session-level retry/resolution statistics.
 *
 * A session is "resolved" when it contains at least one PASS. It is "resolved
 * within N" when its earliest PASS has `attemptNumber <= N`. All rates are
 * expressed as fractions in [0, 1] (NOT 0..100), with `totalSessions` as the
 * denominator so unresolved sessions are counted.
 */
export interface SessionStats {
  /** Number of distinct sessions. */
  totalSessions: number;
  /** Mean attempts per session (`totalAttempts / totalSessions`); 0 when none. */
  avgAttemptsPerSession: number;
  /** Fraction of sessions resolved on the first attempt (PASS at `attemptNumber` 1). */
  pctResolvedWithin1: number;
  /**
   * Fraction of sessions whose earliest PASS has `attemptNumber <= n`.
   * Returns 0 when there are no sessions; non-positive `n` yields 0.
   */
  pctResolvedWithinN: (n: number) => number;
}

/**
 * Compute {@link SessionStats} for a set of attempts.
 *
 * "Resolved" means the session contains at least one PASS (derived from
 * `isCorrect` via {@link deriveOutcome}); the resolution depth is the smallest
 * `attemptNumber` among that session's PASS attempts. `pctResolvedWithinN` closes
 * over the precomputed per-session resolution depths, so calling it repeatedly is
 * cheap and side-effect free.
 *
 * @param attempts - Attempts in scope (not mutated).
 * @returns Aggregate session statistics, including a reusable `pctResolvedWithinN`.
 */
export function sessionStats(attempts: readonly Attempt[]): SessionStats {
  const sessions = groupBySession(attempts);
  const totalSessions = sessions.size;
  const totalAttempts = attempts.length;

  /** Earliest PASS attempt number per session; null when never resolved. */
  const resolutionDepths: (number | null)[] = [];
  for (const list of sessions.values()) {
    let earliestPass: number | null = null;
    for (const attempt of list) {
      if (deriveOutcome(attempt.isCorrect) === 'pass') {
        if (earliestPass === null || attempt.attemptNumber < earliestPass) {
          earliestPass = attempt.attemptNumber;
        }
      }
    }
    resolutionDepths.push(earliestPass);
  }

  const pctResolvedWithinN = (n: number): number => {
    if (totalSessions === 0 || n <= 0) return 0;
    let resolved = 0;
    for (const depth of resolutionDepths) {
      if (depth !== null && depth <= n) resolved += 1;
    }
    return resolved / totalSessions;
  };

  return {
    totalSessions,
    avgAttemptsPerSession:
      totalSessions === 0 ? 0 : totalAttempts / totalSessions,
    pctResolvedWithin1: pctResolvedWithinN(1),
    pctResolvedWithinN,
  };
}

/**
 * Distribution of sessions by their attempt count (the "retry" distribution).
 *
 * @param attempts - Attempts in scope (not mutated).
 * @returns Map of `attemptCount` -> number of sessions having exactly that many
 *   attempts. For example `{ 1 => 5, 3 => 1 }` means five single-attempt sessions
 *   and one session with three attempts.
 */
export function retryDistribution(
  attempts: readonly Attempt[],
): Map<number, number> {
  const sessions = groupBySession(attempts);
  const distribution = new Map<number, number>();
  for (const list of sessions.values()) {
    const size = list.length;
    distribution.set(size, (distribution.get(size) ?? 0) + 1);
  }
  return distribution;
}
