# Metric Definitions (Single Source of Truth)

This document defines **every** metric the Kutuby ML Intelligence Dashboard may
render. If a number appears on a screen, its definition lives here. **Do not
invent a metric that is not in this file.** If a new metric is needed, add it
here first (with formula, source fields, and caveats), get sign-off, then build
it.

## Conventions used below

- **Source table:** `public.child_pronunciation_attempt` (production, IMMUTABLE,
  read-only, one row per verification API call). Referred to below as `cpa`.
- All reads happen **server-side with the service role key**. RLS on the
  production table is parent-scoped and irrelevant to internal staff.
- "SQL-ish" snippets are illustrative derivations, not necessarily the exact
  shipped query. JSONB access uses Postgres operators: `->` (json), `->>` (text),
  and `(jsonb ->> 'x')::numeric` for numeric casts.
- JSONB columns (`model_output`, `client_context`) are **tolerant**: fields
  evolve, may be absent, and are parsed with `.passthrough()`. Every numeric
  extraction from JSONB must guard against `NULL`/missing keys.
- Time semantics (LOCKED): use **`recorded_at`** for behavioral / "when the child
  practiced" time-series; use **`created_at`** only for ingestion-timing metrics.
- Shared types (from `src/types/domain.ts`, do not redefine):
  `AttemptOutcome = 'pass' | 'fail' | 'error'`, `AttemptType = 'letter' | 'word'`.

---

## 1. Outcome taxonomy: PASS / FAIL / ERROR (LOCKED)

This is the canonical three-way classification of every attempt. It is derived
**only** from `cpa.is_correct` (a nullable boolean parsed upstream from the model
`result` field). There is no fourth bucket.

| Outcome | Condition           | Meaning                                              |
| ------- | ------------------- | ---------------------------------------------------- |
| `pass`  | `is_correct = true` | Model judged the pronunciation correct.              |
| `fail`  | `is_correct = false`| Model judged the pronunciation incorrect.           |
| `error` | `is_correct IS NULL`| API/network failure; no valid verdict was produced.  |

**Derivation:**

```sql
CASE
  WHEN cpa.is_correct = TRUE  THEN 'pass'
  WHEN cpa.is_correct = FALSE THEN 'fail'
  WHEN cpa.is_correct IS NULL THEN 'error'
END AS outcome
```

- **Source field:** `is_correct` only.
- **Caveat — ERROR is not failure.** `error` rows are operational failures
  (e.g. `model_output = { "error": "..." }`), not model mistakes. Never fold
  `error` into `fail`. Rates that describe model quality (pass rate, fail rate)
  must state their denominator explicitly (see §2).
- **Caveat — counts must reconcile.** `count(pass) + count(fail) + count(error)`
  must equal `count(*)` for the same filter. If they don't, the filter is wrong.

### 1a. The child-facing "Retry / Almost there" banding is NOT reproduced

The mobile app shows children a softened three-band UI (e.g. "Pass" /
"Almost there / Retry" / "Try again"). **That banding is front-end-only,
motivational, and is INTENTIONALLY NOT reproduced in this dashboard.**

- The app's "Retry / Almost there" band is a UX presentation layer derived from
  client-side thresholds; it is **not** a stored field and is **not** a model
  outcome.
- This dashboard reports only the objective model verdict (`is_correct`) mapped
  to PASS / FAIL / ERROR. We never re-derive an "almost" band from confidence or
  similarity. Doing so would manufacture a metric the data does not contain.
- "Retry" in this dashboard means something completely different: a **session-level**
  behavior (multiple attempts sharing a `session_id`), defined in §4. Do not
  conflate the two senses of the word.

---

## 2. Pass / Fail / Error rates

Three rates over a filtered set of attempts. **Always show the denominator.**

```sql
pass_rate_all    = count(*) FILTER (WHERE is_correct = TRUE)  / NULLIF(count(*), 0)
fail_rate_all    = count(*) FILTER (WHERE is_correct = FALSE) / NULLIF(count(*), 0)
error_rate       = count(*) FILTER (WHERE is_correct IS NULL) / NULLIF(count(*), 0)
```

- **Source field:** `is_correct`.
- **Two valid denominators — label which one you mean:**
  - **Over all attempts** (`/ count(*)`): includes `error` rows. Use for
    operational health dashboards.
  - **Over scored attempts only** (`/ count(*) FILTER (WHERE is_correct IS NOT NULL)`):
    excludes `error` rows. Use when describing **model accuracy**, because an
    API failure is not a model misjudgement.
  - Pick one per chart and state it in the axis/label. Never silently switch.
- **Caveat:** these are **not** ground-truth accuracy. `is_correct` is the
  model's own verdict, not a human label. There is no human-verified label column
  in production. Phrase as "model pass rate", never "accuracy".
- **Caveat — division by zero:** wrap every denominator in `NULLIF(..., 0)`.

---

## 3. Volume: total attempts vs attempts-with-audio (LOCKED distinction)

Two different counts that must never be used interchangeably.

| Metric                  | Formula                                                       | Source field          |
| ----------------------- | ------------------------------------------------------------ | --------------------- |
| **Total attempts**      | `count(*)`                                                    | (row count)           |
| **Attempts with audio** | `count(*) FILTER (WHERE audio_storage_path IS NOT NULL)`      | `audio_storage_path`  |
| **Attempts missing audio** | `count(*) FILTER (WHERE audio_storage_path IS NULL)`      | `audio_storage_path`  |

- A row exists per **verification call**, even when the audio upload failed
  (`audio_storage_path IS NULL`). The model can still have returned a verdict
  for an attempt whose recording never landed in storage.
- **"Recordings"** (the dataset-building sense) means **attempts with audio**,
  i.e. `audio_storage_path IS NOT NULL`. Any chart titled "recordings" must use
  this filter. "Attempts" means all rows.
- `audio_storage_path` is a storage **key** (path inside the
  `pronunciation-recordings` bucket), **not** a URL. It is never a count of
  bytes — storage size is a BLOCKED metric (see §13).
- See §11 (capture health) for the % null audio metric.

---

## 4. Retry / session metrics (session-level, NOT an outcome)

A **session** = all rows sharing one `session_id` (one lesson step). Retries
within a session increment `attempt_number` (1-based). Retry is therefore a
**count of attempts per session**, never a per-attempt outcome.

### 4a. Attempts per session

```sql
WITH s AS (
  SELECT session_id, count(*) AS attempts, max(attempt_number) AS max_attempt
  FROM cpa
  GROUP BY session_id
)
SELECT
  avg(attempts)                          AS avg_attempts_per_session,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY attempts) AS median_attempts,
  max(attempts)                          AS max_attempts_per_session
FROM s;
```

- **Source fields:** `session_id`, `attempt_number`.
- **Caveat — prefer `count(*)` over `max(attempt_number)`** for "attempts in a
  session". They usually match, but if any row is missing (e.g. an ingestion
  gap) `count(*)` is the truth of what we hold; `max(attempt_number)` reflects
  what the client thought it sent. Pick `count(*)` and note the assumption.
- **Caveat — `session_id` can theoretically span types.** Group/aggregate within
  the same `attempt_type` when comparing letters vs words; do not assume a
  session is single-type without checking.

### 4b. % of sessions resolved within N attempts

A session is **resolved** if it contains at least one `pass`. "Resolved within N"
means the first passing attempt occurred at `attempt_number <= N`.

```sql
WITH first_pass AS (
  SELECT session_id, min(attempt_number) FILTER (WHERE is_correct = TRUE) AS first_pass_attempt
  FROM cpa
  GROUP BY session_id
)
SELECT
  count(*) FILTER (WHERE first_pass_attempt IS NOT NULL AND first_pass_attempt <= :N)
    / NULLIF(count(*), 0) AS pct_resolved_within_n
FROM first_pass;
```

- **Source fields:** `session_id`, `attempt_number`, `is_correct`.
- Render N as a small set (e.g. 1, 2, 3) or a slider. Always show N in the label.
- **Caveat — never-resolved sessions:** `first_pass_attempt IS NULL` means the
  session never passed. They stay in the denominator (they are real sessions) and
  are excluded from the numerator. Optionally surface "% sessions never resolved"
  as its own number.
- **Caveat — `error` attempts inside a session** still count toward the attempt
  total but can never satisfy "resolved" (they are not a `pass`). An all-error
  session is unresolved.
- **Caveat — censoring:** a session recorded near the end of the time window may
  still be in progress; a low "resolved within N" near the window edge can be an
  artifact, not a regression.

---

## 5. Recordings by letter / by word

Distribution of attempts (or recordings) across pronunciation targets.

```sql
SELECT attempt_type, target_sent_to_api, count(*) AS attempts,
       count(*) FILTER (WHERE audio_storage_path IS NOT NULL) AS recordings
FROM cpa
GROUP BY attempt_type, target_sent_to_api
ORDER BY attempts DESC;
```

- **Canonical grouping key:** `target_sent_to_api` (a stable letter **label**
  such as `"Alif"`, or the literal word string). **Always group by this**, never
  by `target_display`.
- **`target_display` is display-only and NULLABLE** — it is the glyph/word shown
  in the UI and must not be used as a grouping key (it can be null and is not
  canonical).
- **Glyph rendering:** for letters, render the Arabic glyph (e.g. `ا` for
  `"Alif"`) via the front-end **letters mapping** (label → glyph lookup). The
  mapping is a presentation lookup only; the underlying group/identity stays the
  label `target_sent_to_api`. If a label is missing from the mapping, fall back
  to showing the raw label — never drop the row and never guess a glyph.
- Split letters vs words by `attempt_type` (`'letter'` | `'word'`). Do not mix
  them in one "by target" chart without a type facet.
- **Caveat:** counts here are dominated by curriculum/lesson ordering and traffic,
  not difficulty. A high count means "practiced often", not "hard".

---

## 6. Per-model confidence distributions (LOCKED: never blend)

Letters and words are **different models with different score fields and
different scales**. They get **separate** distributions on **separate** axes.

### 6a. Letter model (`attempt_type = 'letter'`, `.../verify_letter`)

Fields live in `model_output`:

| Field                                          | Range  | Notes                                  |
| ---------------------------------------------- | ------ | -------------------------------------- |
| `(model_output ->> 'predicted_probability')::numeric` | 0..1   | Model's confidence in predicted letter |
| `(model_output ->> 'target_probability')::numeric`    | 0..1   | Probability mass on the target letter  |
| `(model_output ->> 'confidence')::numeric`            | 0..100 | Letter-model confidence (percent-ish)  |

Auxiliary letter fields (for the row detail / explorer, not the headline
distribution): `predicted_letter`, `transcription`, `similarity`, `message`,
`processing_time_ms`, `model`, `variant`.

### 6b. Word model (`attempt_type = 'word'`, `.../verify_word`)

Fields live in `model_output`:

| Field                                       | Range  | Notes                                       |
| ------------------------------------------- | ------ | ------------------------------------------- |
| `(model_output ->> 'similarity')::numeric`  | 0..1   | Similarity to target word                   |
| `(model_output ->> 'confidence')::numeric`  | 0..100 | Word-model confidence — **UNCALIBRATED**    |

Auxiliary word fields: `transcription`, `message`, `decision_basis`,
`decision_threshold`, `threshold_param_applied`.

### Rules and caveats (mandatory)

- **NEVER blend letter and word scores on one axis or in one statistic.** They
  are heterogeneous in scale (0..1 vs 0..100) and in meaning. Always render
  **per-model** panels.
- **Letter `confidence` and word `confidence` share a name but NOT a scale or
  semantics.** Do not put them on a shared axis, do not average them together,
  do not compute a single "model confidence" number across both.
- **Word `confidence` is UNCALIBRATED.** Any word-confidence visual must carry a
  visible calibration caveat (e.g. "uncalibrated — do not read as probability").
  Do not draw probability-style thresholds on it as if it were calibrated.
- **`predicted_probability`/`target_probability` (0..1) vs `confidence` (0..100)**
  are different axes even within the letter model; keep them on separate scales.
- **Missing values:** any of these keys may be absent (older rows, `error` rows
  carry `{ "error": ... }` with no scores). Exclude rows where the cast is
  `NULL`/missing from the distribution and report the excluded count.
- Histograms should bin within a model's own native range; never normalize one
  model's range onto the other's.

---

## 7. Daily growth (recorded_at vs created_at) — LOCKED time semantics

Two distinct time-series. Choose the timestamp deliberately and label it.

| Metric                  | Bucket field  | Use for                                            |
| ----------------------- | ------------- | -------------------------------------------------- |
| **Practice volume / day** | `recorded_at` | Child behavior: when attempts actually happened.   |
| **Ingestion / day**       | `created_at`  | Pipeline timing: when rows landed in the database. |

```sql
-- Behavioral daily growth (default for product/usage charts)
SELECT date_trunc('day', recorded_at) AS day, count(*) AS attempts
FROM cpa GROUP BY 1 ORDER BY 1;

-- Ingestion daily growth (pipeline/ops only)
SELECT date_trunc('day', created_at) AS day, count(*) AS rows_ingested
FROM cpa GROUP BY 1 ORDER BY 1;
```

- **Default to `recorded_at`** for anything user-facing about practice/usage.
- **Use `created_at`** only when the question is explicitly about ingestion lag or
  backfills. The two diverge during backfills/late uploads — never treat them as
  interchangeable.
- **Caveat — timezone:** truncate in a single declared timezone (document UTC vs
  local). Both are `timestamptz`; be explicit so day boundaries are reproducible.
- **Caveat — partial edge days:** the first and last buckets in any window are
  usually partial; mark or trim them so a partial day isn't read as a drop.
- "Cumulative growth" is the running `sum()` of the daily series over the chosen
  timestamp; it inherits all caveats above.

---

## 8. Latency

There are two different latency signals; they measure different things and must
be labelled distinctly. **Server inference time is NOT directly available.**

| Metric                  | Source                                              | Range/Unit | Meaning                                              |
| ----------------------- | --------------------------------------------------- | ---------- | ---------------------------------------------------- |
| **Client round-trip**   | `(client_context ->> 'apiLatencyMs')::numeric`      | ms         | App-measured request→response, **incl. network**.    |
| **Model processing**    | `(model_output ->> 'processing_time_ms')::numeric`  | ms         | Server-reported inference time, **where present**.   |

```sql
SELECT
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY (client_context ->> 'apiLatencyMs')::numeric) AS p50_roundtrip_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (client_context ->> 'apiLatencyMs')::numeric) AS p95_roundtrip_ms
FROM cpa
WHERE client_context ? 'apiLatencyMs';
```

- **`client_context.apiLatencyMs` is the CLIENT round-trip, not server inference
  time.** It includes the child's device network, mobile radio, and upload —
  treat it as an upper bound on server latency, never as model speed.
- **`model_output.processing_time_ms`** is the closest thing to server-side
  inference time, but it is **only present on the letter model** (and only where
  the API returns it). It is **not** end-to-end server latency (excludes queueing,
  cold start, network at the GCP edge). Surface it as "model processing (letter,
  where reported)" and never extrapolate to words.
- **Caveat — report percentiles, not just mean.** Latency is heavy-tailed; show
  p50/p95 and the sample count (rows where the field exists).
- **Caveat — sparse fields.** Both keys can be missing; always filter to rows that
  have them and report coverage, otherwise percentiles are biased.
- Full **server-side latency** (queueing, cold starts, true inference) is a
  BLOCKED metric — see §13.

---

## 9. Dataset balance / class imbalance

How evenly attempts (or recordings) are spread across targets within a model.

```sql
WITH c AS (
  SELECT target_sent_to_api, count(*) AS n
  FROM cpa
  WHERE attempt_type = :type   -- compute per model, never pooled
  GROUP BY target_sent_to_api
)
SELECT
  min(n) AS min_per_target,
  max(n) AS max_per_target,
  max(n)::numeric / NULLIF(min(n), 0) AS imbalance_ratio,   -- max/min
  avg(n) AS mean_per_target,
  stddev_pop(n) / NULLIF(avg(n), 0) AS coeff_of_variation
FROM c;
```

- **Source fields:** `target_sent_to_api`, `attempt_type`.
- **Compute per `attempt_type`.** Letter-class balance and word-class balance are
  separate questions; never pool letters and words into one imbalance number.
- **Choose the unit explicitly:** balance of **attempts** (traffic) vs balance of
  **recordings** (`audio_storage_path IS NOT NULL`, the trainable dataset). For
  retraining/dataset-building, balance of **recordings** is the relevant one.
- **Caveat:** imbalance here reflects lesson exposure and traffic, not a sampling
  policy. State it so imbalance isn't misread as a labeling bug.
- Optional headline: "share of recordings in the top-K targets" as a one-number
  concentration measure; define K in the label.

---

## 10. Error rate (operational)

Share of attempts that produced no model verdict (API/network failure).

```sql
error_rate = count(*) FILTER (WHERE is_correct IS NULL) / NULLIF(count(*), 0)
```

- **Source field:** `is_correct` (NULL) — corroborated by
  `model_output ? 'error'` / `model_output ->> 'error'` for the failure message.
- This is the **ERROR** bucket of the §1 taxonomy expressed as a rate over **all**
  attempts. Keep the denominator = all attempts (an error is, by definition, part
  of total traffic).
- **Caveat — distinct from `fail`.** Error rate measures pipeline/model
  availability, not pronunciation quality. Never add it to the fail rate.
- **Caveat:** for diagnosis, optionally break down by `client_context.httpStatus`
  and `model_output ->> 'error'`, and by `attempt_type`, to separate timeouts from
  4xx/5xx. These breakdowns are descriptive, not new headline metrics.

---

## 11. Capture health (% null audio)

How often a verification happened but the recording never reached storage.

```sql
missing_audio_rate = count(*) FILTER (WHERE audio_storage_path IS NULL)
                     / NULLIF(count(*), 0)

audio_capture_rate = 1 - missing_audio_rate
```

- **Source field:** `audio_storage_path` (NULL = upload failed / no key stored).
- This is the bridge between §3's two counts: `audio_capture_rate * total_attempts
  ≈ attempts_with_audio`.
- **Caveat — null path ≠ deleted file and ≠ verified-present file.** A non-null
  path is the *claim* that an object exists at that key; it is not a guarantee the
  object is retrievable. Object existence/integrity verification requires a
  storage API call and is out of scope for this SQL metric.
- **Caveat:** trend capture health over `recorded_at` to catch client upload
  regressions; a spike in missing audio is an app/pipeline issue, not a model one.

---

## 12. Cross-cutting filters (apply consistently)

Every metric above is computed over a filtered slice. Supported filter
dimensions and their source fields:

- **Date range** → `recorded_at` (default) or `created_at` (ingestion views only).
- **Attempt type** → `attempt_type` (`'letter'` | `'word'`).
- **Target** → `target_sent_to_api` (canonical; glyph shown via letters mapping).
- **Outcome** → derived PASS/FAIL/ERROR from `is_correct` (§1).
- **Has audio** → `audio_storage_path IS [NOT] NULL`.
- **Confidence/similarity** → per-model fields from §6 (never blended across
  models; a confidence filter must specify which model it applies to).

A "model version" filter is **BLOCKED** (§13) and must render disabled.

---

## 13. BLOCKED metrics (do not build; render disabled with a note)

These cannot be computed from the data we have. Show them **disabled** with an
explicit "not available" note. **Never fabricate or estimate them.**

| Blocked metric                | Why blocked                                                                                          | Required to unblock                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Model version usage**       | `model_version` is **NOT captured per attempt**. (`model_output.model`/`variant` exist on letters only, are not a reliable version, and are absent for words.) | Add a per-attempt `model_version` to ingestion. Until then: render disabled with "model version not captured yet — do not infer". |
| **Server-side latency (true)**| `apiLatencyMs` is client round-trip; `processing_time_ms` is partial (letter-only, no queue/cold-start). No end-to-end server timing is stored. | External APM / GCP Cloud Run metrics (external API).                 |
| **Storage usage / size (bytes, cost)** | `audio_storage_path` is a key, not a size. Row counts ≠ bytes. | Supabase Storage / bucket metering API (external API).              |
| **Infra metrics** (CPU, GPU, memory, throughput, uptime, egress) | Not present in `child_pronunciation_attempt` at all.                                                 | GCP / Supabase monitoring APIs (external API).                       |
| **Ground-truth accuracy**     | No human-verified label column exists; `is_correct` is the model's own verdict.                      | A human-labeling pipeline (out of current scope).                   |
| **Child-facing "Almost there / Retry" band** | Front-end-only motivational UX, not stored and intentionally not reproduced (§1a).         | N/A — by product decision this is never reproduced here.            |

---

## Quick reference: metric → source field(s)

| Metric                          | Primary source field(s)                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| PASS / FAIL / ERROR             | `is_correct` (true / false / null)                                  |
| Pass/fail/error rate            | `is_correct` (+ chosen denominator)                                 |
| Total attempts                  | row count                                                           |
| Attempts with audio / recordings| `audio_storage_path IS NOT NULL`                                    |
| Avg attempts per session        | `session_id`, `attempt_number`                                      |
| % sessions resolved within N    | `session_id`, `attempt_number`, `is_correct`                        |
| Recordings by letter/word       | `target_sent_to_api`, `attempt_type` (glyph via letters mapping)   |
| Letter confidence dist.         | `model_output.predicted_probability / target_probability / confidence` |
| Word confidence dist.           | `model_output.similarity / confidence` (uncalibrated)              |
| Daily growth (behavioral)       | `recorded_at`                                                       |
| Daily growth (ingestion)        | `created_at`                                                        |
| Client round-trip latency       | `client_context.apiLatencyMs`                                       |
| Model processing time           | `model_output.processing_time_ms` (letter, where present)          |
| Dataset balance / imbalance     | `target_sent_to_api`, `attempt_type`                                |
| Error rate                      | `is_correct IS NULL`                                                |
| Capture health (% null audio)   | `audio_storage_path IS NULL`                                        |
