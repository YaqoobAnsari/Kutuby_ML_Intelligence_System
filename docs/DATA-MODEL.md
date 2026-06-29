# Data Model — Kutuby ML Intelligence Dashboard

> This document describes the dashboard's **own additive schema** and how it sits
> **beside** (never on top of, never mutating) the immutable production schema.
>
> **Hard rule:** nothing here writes to production data. The production table
> `public.child_pronunciation_attempt` is **read-only / immutable** for us. Our
> objects are additive **views, RPCs, an audit table, and (Phase 5) a curation
> table**. They live in `supabase/migrations/*` and are **NOT auto-applied** —
> they require **human sign-off** (see `supabase/README.md`).

---

## 1. Two schemas, strictly separated

```
┌──────────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ PRODUCTION (immutable — owned elsewhere)   │        │ DASHBOARD ADDITIVE (owned by us)        │
│                                            │ READ   │                                         │
│ public.child_pronunciation_attempt         │◄───────│ views:  dash_*  (aggregates/projections)│
│ storage bucket: pronunciation-recordings   │ ONLY   │ rpcs:   dash_* (typed read functions)   │
│ (RLS = parent-scoped; we bypass via        │        │ table:  dashboard_audit_log  (we WRITE) │
│  SERVICE ROLE, server-side only)           │        │ table:  dashboard_curation_label (P5)   │
└──────────────────────────────────────────┘        └──────────────────────────────────────┘
```

- We **read** production via views/RPCs using the **service-role key,
  server-side only**.
- We **write** only to **our** tables (`dashboard_audit_log` always;
  `dashboard_curation_label` in Phase 5).
- No foreign key from our tables enforces changes on production; we reference
  `child_pronunciation_attempt.id` by value only.

---

## 2. Production table (reference — DO NOT WRITE)

`public.child_pronunciation_attempt` — **one row per verification call**
(retries share `session_id` and increment `attempt_number`).

| Column               | Type          | Notes                                                            |
| -------------------- | ------------- | ---------------------------------------------------------------- |
| `id`                 | uuid PK       |                                                                  |
| `child_id`           | uuid          | FK → `child_user.id`                                             |
| `session_id`         | text          | groups retries in a lesson step                                 |
| `attempt_number`     | int           | 1-based index within the session                                |
| `attempt_type`       | text          | `"letter"` \| `"word"`                                           |
| `target_display`     | text NULL     | UI glyph/word shown to child                                     |
| `target_sent_to_api` | text          | **canonical grouping key** (e.g. `"Alif"`, or the word string)  |
| `is_correct`         | boolean NULL  | parsed from model `result`; **NULL on API/network error**       |
| `model_output`       | jsonb         | raw verification response, or `{ "error": "…" }` on failure     |
| `client_context`     | jsonb         | app-side metadata                                               |
| `audio_storage_path` | text NULL     | storage **key** (not a URL); NULL if upload failed             |
| `recorded_at`        | timestamptz   | when the attempt was recorded (**use for behavioural series**)   |
| `created_at`         | timestamptz   | row insert time (**use for ingestion timing**)                  |

Indexes today: `child_id`, `session_id`, `recorded_at desc`.

**Outcome derivation (canonical, used everywhere):**
`is_correct === true → pass`, `is_correct === false → fail`,
`is_correct === null → error`. **Retry is not an outcome** — it is a count of
attempts sharing a `session_id`.

### JSON shapes (parse tolerantly with Zod `.passthrough()`)

- **Letter** (`verify_letter`): `result`(bool), `predicted_letter`,
  `predicted_probability`(0..1), `target_probability`(0..1), `confidence`(0..100),
  `transcription`, `similarity`, `message`, `processing_time_ms`, `model`,
  `variant`.
- **Word** (`verify_word`): `result`(bool), `similarity`, `confidence`(0..100),
  `transcription`, `message`, `decision_basis`, `decision_threshold`,
  `threshold_param_applied`.
- **Failure:** `{ "error": "<message>" }`.
- **`client_context`:** `endpoint`, `httpStatus`, `apiLatencyMs`,
  `targetTextApp`, `requestPayload { target_letter | target_word, threshold,
  fuzzy_match, fuzzy_threshold }`, `recordingDurationMs`, `speechDetected`(bool),
  `peakMeteringDb`, `stopReason`, `platform`, `appVersion`, `deviceModel`,
  `isRealDevice`, `isSimulator`.

> **Feasibility flag:** there is **no per-attempt model version** anywhere in
> this table. Version-based analytics are **blocked**; never synthesize a version
> from `model`/`variant`. See `INTEGRATIONS.md`.

---

## 3. Read-model strategy: views + RPCs (additive, read-only)

All dashboard reads go through additive objects named with a `dash_` prefix.
They **only `SELECT`** from production; they never mutate it.

**Views implemented in `supabase/migrations/0001_dashboard_views.sql` (Phase 1):**

- `dash_attempt_flat` — one row per attempt with the hot JSONB fields projected
  to typed columns (`outcome`, `has_audio`, `confidence`, `predicted_probability`,
  `target_probability`, `similarity`, `predicted_letter`, `api_latency_ms`,
  `speech_detected`, …) plus the raw `model_output` / `client_context` retained
  for tolerant downstream parsing. `outcome` is the canonical pass/fail/error
  mapping and `has_audio = audio_storage_path IS NOT NULL`.
- `dash_daily_metrics` — per-day (UTC, `recorded_at`) counts by outcome +
  `with_audio` (Executive Overview, daily growth).
- `dash_target_metrics` — per `attempt_type` × `target_sent_to_api` counts and
  outcome rates, letters and words never pooled (Dataset Quality / balance).

**Planned (Phase 3):**

- `dash_latency` — latency percentiles from `client_context.apiLatencyMs` /
  `model_output.processing_time_ms`, **split by `attempt_type`**.
- `dash_confidence_histogram` — confidence buckets **per model** (letters and
  words **separate**; word confidence flagged uncalibrated). Never blended.

**RPCs (typed read functions, `SECURITY INVOKER`, read-only):** parameterized
reads for the Dataset Explorer (filtered, paginated raw rows) and detail lookups.
RPC signatures are the stable contract consumed by `src/server/queries/*`.

**Upgrade path:** if view latency degrades at scale, the heaviest aggregates
(`dash_daily_metrics`, `dash_target_metrics`, `dash_confidence_histogram`) can
be promoted to **materialized views** with scheduled refresh
(`REFRESH MATERIALIZED VIEW CONCURRENTLY`, e.g. via `pg_cron`). The `dash_*`
names and RPC signatures stay identical, so no app code changes. Deferred until
measured. Any change ships as a new additive, human-signed-off migration.

---

## 4. `dashboard_audit_log` (our table — we WRITE here)

Append-only audit of every privileged access. **Mandatory** for every raw-row
read and every audio access (governance decision #4). Writes happen
**server-side only**.

```sql
create table if not exists public.dashboard_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_email text        not null,
  actor_role  text,                              -- 'viewer' | 'analyst' | 'admin'
  action      text        not null,              -- see below
  attempt_id  uuid,                              -- references attempt by value (no FK)
  target_path text,                              -- storage key when audio is accessed
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists dashboard_audit_log_created_at_idx
  on public.dashboard_audit_log (created_at desc);
create index if not exists dashboard_audit_log_actor_email_idx
  on public.dashboard_audit_log (actor_email);
```

**`action` vocabulary:** `list_attempts`, `view_attempt`, `play_audio`,
`export` (extend additively as needed).

**Rules:**
- Aggregate-only pages (viewer) do **not** require per-view audit rows, but any
  drill-down to raw rows or audio **does**.
- `target_path` and signed URLs: the **key** may be logged; the **signed URL is
  never persisted** (TTL ≤ 900s, minted per request).
- This table is additive and human-signed-off like every other migration.

---

## 5. Phase 5 — human-label / curation table (forward-looking sketch)

For the proprietary retraining dataset. **Additive, ours, never touches
production.** A reviewer's verdict is stored **here**, leaving the immutable
`is_correct` from the model untouched — enabling model-vs-human comparison.

```sql
-- SKETCH (Phase 5) — finalized with the ML team before implementation.
create table if not exists public.dashboard_curation_label (
  id            uuid        primary key default gen_random_uuid(),
  attempt_id    uuid        not null,            -- value ref to child_pronunciation_attempt.id
  verdict       text        not null,            -- 'correct' | 'incorrect' | 'unintelligible' | 'wrong_target' | 'noisy'
  reviewer_email text       not null,            -- who labelled (allowlisted staff)
  status        text        not null default 'pending', -- 'pending' | 'reviewed' | 'approved' | 'rejected'
  split         text,                            -- 'train' | 'val' | 'test' (assigned at export)
  notes         text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists dashboard_curation_label_attempt_reviewer_idx
  on public.dashboard_curation_label (attempt_id, reviewer_email);
create index if not exists dashboard_curation_label_status_idx
  on public.dashboard_curation_label (status);
create index if not exists dashboard_curation_label_split_idx
  on public.dashboard_curation_label (split);
```

Design intent:
- **`verdict`** = the human label (kept distinct from the model's `is_correct`).
- **`reviewer_email`** + unique `(attempt_id, reviewer_email)` allow multi-rater
  labelling and inter-rater agreement later.
- **`status`** drives a review workflow (`pending → reviewed → approved`).
- **`split`** is assigned at export time to produce reproducible train/val/test
  partitions. Exports are admin-only and write an `export` row to
  `dashboard_audit_log`.

Enum value sets above are **provisional** (open decision O1 in the plan).

---

## 6. Non-negotiables recap

1. Production table & bucket are **read-only**; we only ever `SELECT`/sign URLs.
2. All our SQL is **additive** under `supabase/migrations/*`, **not
   auto-applied**, **human-signed-off** (`supabase/README.md`).
3. Production is read with the **service-role key, server-side only**.
4. Every raw-row/audio access → `dashboard_audit_log`. Signed URLs (TTL ≤ 900s)
   are never persisted.
