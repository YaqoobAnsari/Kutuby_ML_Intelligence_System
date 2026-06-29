import type { Attempt, AttemptOutcome, OutcomeBreakdown } from '@/types/domain';

/**
 * Derive the canonical {@link AttemptOutcome} from a raw `is_correct` value.
 *
 * The taxonomy is fixed and used EVERYWHERE in the dashboard:
 * - `true`  -> `'pass'`  (the model judged the pronunciation correct)
 * - `false` -> `'fail'`  (the model judged the pronunciation incorrect)
 * - `null`  -> `'error'` (the verification call itself failed: API/network error,
 *   `model_output` is `{ error: "..." }`)
 *
 * IMPORTANT — this is deliberately NOT the same thing as the front-end mobile
 * app's encouragement banding ("Almost there!" / "Try again" / "Retry"). Those
 * bands are child-facing UX cues derived from confidence/similarity thresholds
 * and motivational copy; they are NOT ground-truth outcomes. Outcome here is
 * derived solely from the model's boolean `is_correct`. Likewise, "Retry" is NOT
 * an outcome value — it is a session-level behaviour (multiple attempts sharing a
 * `session_id`) measured by the session metrics, not an outcome class here.
 *
 * @param isCorrect - The raw `is_correct` column (`true` | `false` | `null`).
 * @returns The derived outcome.
 */
export function deriveOutcome(isCorrect: boolean | null): AttemptOutcome {
  if (isCorrect === true) return 'pass';
  if (isCorrect === false) return 'fail';
  return 'error';
}

/**
 * PASS/FAIL/ERROR counts with the two distinct rate families.
 *
 * Rates "exclude nothing" — the `*Rate` fields use `total` (including errors) as
 * the denominator. `passRateExclErrors` is the separate, error-excluded accuracy
 * metric most useful for judging model quality once infrastructure failures are
 * removed from the denominator.
 */
export interface OutcomeSummary extends OutcomeBreakdown {
  /** PASS / total (errors INCLUDED in denominator); 0 when `total === 0`. */
  passRate: number;
  /** FAIL / total (errors INCLUDED in denominator); 0 when `total === 0`. */
  failRate: number;
  /** ERROR / total; 0 when `total === 0`. */
  errorRate: number;
  /**
   * PASS / (PASS + FAIL) — the accuracy among attempts that actually got a
   * model verdict, with ERRORs removed from the denominator. 0 when there are
   * no decided (pass+fail) attempts.
   */
  passRateExclErrors: number;
}

/**
 * Summarize a collection of attempts into PASS/FAIL/ERROR counts and rates.
 *
 * Outcomes are re-derived from each attempt's `isCorrect` via {@link deriveOutcome}
 * so this is the single source of truth and never trusts a stale precomputed field.
 *
 * Denominator conventions (see {@link OutcomeSummary}):
 * - `passRate`/`failRate`/`errorRate` divide by `total` (errors included).
 * - `passRateExclErrors` divides by `pass + fail` (errors excluded).
 * - Division-by-zero cases yield `0` rather than `NaN`/`null`, keeping every
 *   rate a finite number for charting.
 *
 * @param attempts - Attempts in scope (any order; not mutated).
 * @returns Counts plus derived rates.
 */
export function summarizeOutcomes(
  attempts: readonly Attempt[],
): OutcomeSummary {
  let pass = 0;
  let fail = 0;
  let error = 0;

  for (const attempt of attempts) {
    const outcome = deriveOutcome(attempt.isCorrect);
    if (outcome === 'pass') pass += 1;
    else if (outcome === 'fail') fail += 1;
    else error += 1;
  }

  const total = pass + fail + error;
  const decided = pass + fail;

  return {
    pass,
    fail,
    error,
    total,
    passRate: total === 0 ? 0 : pass / total,
    failRate: total === 0 ? 0 : fail / total,
    errorRate: total === 0 ? 0 : error / total,
    passRateExclErrors: decided === 0 ? 0 : pass / decided,
  };
}
