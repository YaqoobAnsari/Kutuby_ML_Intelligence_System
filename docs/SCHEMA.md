# SCHEMA — Database Contract (Canonical)

> **Source of truth.** This document is the version-controlled, authoritative schema
> contract for the Kutuby ML Intelligence Dashboard. It **replaces `docs/DATABASE.pdf`**
> (a binary export that is no longer authoritative). When this file and the PDF disagree,
> **this file wins**. The PDF is retained only as a historical BE reference.

The dashboard is **read-only**. The production table `public.child_pronunciation_attempt`
is **immutable** from our perspective: we never INSERT, UPDATE, or DELETE it. All of our
own SQL (read-only views, RPCs, and the `dashboard_audit_log` table) lives under
`supabase/migrations/*` and is **additive**.

---

## 1. Table: `public.child_pronunciation_attempt`

The mobile app logs **one row per letter/word pronunciation verification call** to
Supabase for analytics and QA. Retries within a single lesson step share a `session_id`
and increment `attempt_number`.

| Column | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `id` | `uuid` | no | Primary key. |
| `child_id` | `uuid` | no | FK → `child_user.id` (cascade delete on the parent table). |
| `session_id` | `text` | no | Groups retries within one lesson step. Client-generated, e.g. `pron-1782121407706-vvlecr`. |
| `attempt_number` | `int` | no | 1-based index of the attempt within the `session_id`. |
| `attempt_type` | `text` | no | `"letter"` or `"word"`. Maps to shared type `AttemptType`. |
| `target_display` | `text` | **yes** | UI glyph/word shown to the child (Arabic letter character or word text). May be `NULL`. |
| `target_sent_to_api` | `text` | no | **Canonical grouping key.** The value sent to the verification API — a letter label (e.g. `"Alif"`) or the word string. Use this, not `target_display`, to group/aggregate by target. |
| `is_correct` | `boolean` | **yes** | Parsed from the model `result`. `true` = PASS, `false` = FAIL, `NULL` = ERROR (API/network failure). See [Outcome taxonomy](#5-outcome-taxonomy). |
| `model_output` | `jsonb` | no | Raw verification API response, or `{ "error": "<message>" }` on failure. See [§6](#6-model_output-shapes-jsonb). |
| `client_context` | `jsonb` | no | App-side request/debug metadata. See [§7](#7-client_context-shape-jsonb). |
| `audio_storage_path` | `text` | **yes** | Storage **key** (not a URL) inside the `pronunciation-recordings` bucket. `NULL` if the upload failed. See [§4](#4-audio-storage-bucket-pronunciation-recordings). |
| `recorded_at` | `timestamptz` | no | When the attempt was recorded (child behavior time). **Use this for behavioral time-series.** |
| `created_at` | `timestamptz` | no | Row insert time (ingestion). **Use this for ingestion timing**, not behavior. |

### 1.1 `recorded_at` vs `created_at`

- `recorded_at` — when the child actually made the attempt. This is the behavioral
  clock; use it for all activity charts, accuracy-over-time, and session reconstruction.
- `created_at` — when the row landed in Postgres. Use it only for ingestion/latency
  monitoring (e.g. detecting delayed or backfilled writes).

---

## 2. Indexes

| Index on | Order | Purpose |
| --- | --- | --- |
| `child_id` | — | Per-child lookups. |
| `session_id` | — | Reconstructing a lesson step's retries. |
| `recorded_at` | `desc` | Recent-activity scans and time-windowed queries. |

> **Note for our queries:** there is **no** composite index and **no** index on
> `target_sent_to_api`, `attempt_type`, or `is_correct`. Aggregations that filter/group
> on those columns will scan; prefer pushing such work into the additive read-only views
> defined under `supabase/migrations/*`.

---

## 3. Row-Level Security (RLS) — and why the dashboard bypasses it

RLS is **enabled** on `public.child_pronunciation_attempt`. The production policy is
**parent-scoped**: an authenticated parent may `SELECT`/`INSERT` only rows for their own
children, enforced as:

```sql
-- production policy (simplified)
child_user.parent_id = auth.uid()
```

**Why this is useless for the dashboard.** Internal ML/QA staff are **not** the parents of
these children, so under the parent-scoped policy `auth.uid()` would match **zero** rows
for any staff session. The policy is designed for the consumer mobile app, not internal
observability.

**Consequence.** The dashboard reads with the Supabase **service role key**, which bypasses
RLS. This is mandatory and non-negotiable for the read path, but it is dangerous, so it is
fenced by hard rules:

- The service role key is used **server-side only** — never shipped to the browser, never
  in a client component, never in `NEXT_PUBLIC_*`.
- Access control is enforced by **our own** layer: the email allowlist
  (`DASHBOARD_ALLOWLIST_EMAILS`) plus RBAC roles (`viewer` / `analyst` / `admin`).
- Every raw-row read and every audio access is recorded in `dashboard_audit_log`
  (see [§8](#8-our-audit-table-dashboard_audit_log)).

---

## 4. Audio storage: bucket `pronunciation-recordings`

| Property | Value |
| --- | --- |
| Bucket | `pronunciation-recordings` |
| Visibility | **Private** (not public). |
| Path format | `{child_id}/{session_id}/{attempt_number}.wav` |
| Example | `7344cb1e-0d6d-4f52-af0a-a2de6f546b53/pron-1782121407706-vvlecr/1.wav` |
| Audio format | WAV, 44.1 kHz, mono. |

The value stored in `audio_storage_path` is the **object key** above — **not** a URL. To
play audio, mint a **signed URL server-side** at read time:

```ts
// server-side only; TTL <= 900s; never persist the resulting URL
const { data } = await supabase.storage
  .from('pronunciation-recordings')
  .createSignedUrl(path, 900)
```

**Governance for signed URLs:**

- Minted **server-side only**, with **TTL ≤ 900 seconds**.
- **Never** persisted to the database or any cache that outlives the request.
- Audio playback requires the **`analyst`** or **`admin`** role; `viewer` cannot play audio.
- Every mint is logged to `dashboard_audit_log` with `action = 'play_audio'`.

> **Production storage-policy caveat.** The live bucket policy lets *any authenticated
> user* read/write objects (a per-bucket open policy). The dashboard does **not** rely on
> that: it treats the bucket as private and brokers all access through short-lived,
> server-minted signed URLs gated by our RBAC. Do not expose direct bucket access to the
> browser.

---

## 5. Outcome taxonomy

Derived from `is_correct`. Use this **everywhere** (maps to shared type `AttemptOutcome`):

| Outcome | Condition | Meaning |
| --- | --- | --- |
| `PASS` | `is_correct === true` | Model accepted the pronunciation. |
| `FAIL` | `is_correct === false` | Model rejected the pronunciation. |
| `ERROR` | `is_correct === null` | API/network failure; `model_output` typically `{ "error": ... }`. |

> **"Retry" is NOT an outcome.** It is a **session-level** metric: the number of attempts
> sharing a `session_id` (i.e. the max `attempt_number` within a session). Do not model it
> as a fourth outcome.

---

## 6. `model_output` shapes (`jsonb`)

Raw JSON from the verification APIs. **Parse tolerantly** (Zod `.passthrough()`) — fields
evolve and not all are guaranteed present.

### 6.1 Letter API — `.../verify_letter`

Endpoint: `https://arabic-letters-api-d26k2plh4q-ew.a.run.app/verify_letter`

| Field | Type | Notes |
| --- | --- | --- |
| `result` | `boolean` | Drives `is_correct`. |
| `predicted_letter` | string | Letter the model heard. |
| `predicted_probability` | number | `0..1`. |
| `target_probability` | number | `0..1`. |
| `confidence` | number | `0..100`. **Letter-scale only** — see [§9](#9-fields-not-available--cautions). |
| `transcription` | string | |
| `similarity` | number | |
| `message` | string | |
| `processing_time_ms` | number | Model-side processing time. |
| `model` | string | |
| `variant` | string | |

### 6.2 Word API — `.../verify_word`

Endpoint: `https://arabic-words-api-d26k2plh4q-ew.a.run.app/verify_word`

| Field | Type | Notes |
| --- | --- | --- |
| `result` | `boolean` | Drives `is_correct`. |
| `similarity` | number | |
| `confidence` | number | `0..100`. **UNCALIBRATED, word-scale only** — see [§9](#9-fields-not-available--cautions). |
| `transcription` | string | |
| `message` | string | |
| `decision_basis` | string | What the accept/reject decision was based on. |
| `decision_threshold` | number | Threshold the decision used. |
| `threshold_param_applied` | boolean/number | Whether/which threshold param was applied. |

### 6.3 Failure shape

On API/network failure, the column holds an error object and `is_correct` is `NULL`
(outcome = `ERROR`):

```json
{ "error": "<message>" }
```

---

## 7. `client_context` shape (`jsonb`)

App-side metadata (not from the model). **Parse tolerantly** (Zod `.passthrough()`).

| Field | Type | Notes |
| --- | --- | --- |
| `endpoint` | string | Verification endpoint the app called. |
| `httpStatus` | number | HTTP status returned to the app. |
| `apiLatencyMs` | number | App-observed round-trip latency. |
| `targetTextApp` | string | Target text as rendered in the app. |
| `requestPayload` | object | See sub-fields below. |
| `recordingDurationMs` | number | Length of the captured audio. |
| `speechDetected` | boolean | Whether the app detected speech. |
| `peakMeteringDb` | number | Peak input level (dB). |
| `stopReason` | string | Why recording stopped (e.g. `"timer_expired"`). |
| `platform` | string | e.g. `"ios"`. |
| `appVersion` | string | e.g. `"3.2.60"`. |
| `deviceModel` | string | e.g. `"iPhone 15"`. |
| `isRealDevice` | boolean | Simulator runs typically skip the save. |
| `isSimulator` | boolean | Complement of `isRealDevice`. |

### 7.1 `requestPayload` sub-fields

| Field | Type | Notes |
| --- | --- | --- |
| `target_letter` | string | Present for **letter** attempts. |
| `target_word` | string | Present for **word** attempts. |
| `threshold` | string/number | Decision threshold the app requested. |
| `fuzzy_match` | boolean | **Word** attempts only. |
| `fuzzy_threshold` | string/number | **Word** attempts only. |

Example:

```json
{
  "endpoint": "https://...",
  "httpStatus": 200,
  "apiLatencyMs": 1234,
  "targetTextApp": "ا",
  "requestPayload": { "target_letter": "alif", "threshold": "0.6" },
  "recordingDurationMs": 4500,
  "speechDetected": true,
  "peakMeteringDb": -18,
  "stopReason": "timer_expired",
  "platform": "ios",
  "appVersion": "3.2.60",
  "deviceModel": "iPhone 15",
  "isRealDevice": true,
  "isSimulator": false
}
```

---

## 8. Our audit table: `dashboard_audit_log`

This is **ours** (additive migration), not part of the production schema. Every raw-row
access and audio access **must** write a row here.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `actor_email` | `text` | Not null. The authenticated staff email. |
| `actor_role` | `text` | `viewer` / `analyst` / `admin`. |
| `action` | `text` | Not null. e.g. `list_attempts`, `view_attempt`, `play_audio`, `export`. |
| `attempt_id` | `uuid` | The attempt accessed, when applicable. |
| `target_path` | `text` | Storage key accessed, when applicable. |
| `metadata` | `jsonb` | Not null, default `'{}'::jsonb`. |
| `created_at` | `timestamptz` | Not null, default `now()`. |

Indexes: `(created_at desc)`, `(actor_email)`.

---

## 9. Fields NOT available / cautions

These limits are **load-bearing** — honor them in metrics and UI. Never fabricate.

| Item | Status | Required handling |
| --- | --- | --- |
| **`model_version`** | **NOT captured** per attempt. | Any "model version" feature is **BLOCKED**. Render it **disabled** with a "not captured yet" note. Never infer or invent it. |
| **Letter `confidence`** | Captured, **letter-scale** (`0..100`). | Show per-model only. |
| **Word `confidence`** | Captured, **UNCALIBRATED**, **word-scale** (`0..100`). | Show per-model with a calibration caveat. |
| **Cross-model confidence** | — | **NEVER blend** letter and word confidence on one axis; they are different scales and semantics. |
| **Audio for every row** | Not guaranteed. | A row may have `audio_storage_path = NULL` (upload failed). Always distinguish **"attempts"** from **"attempts with audio"**. |

---

## 10. Notes for BE (semantics)

- **`session_id` is client-generated**, not a DB session. Format: `pron-<timestamp>-<rand>`,
  e.g. `pron-1782121407706-vvlecr`. Do not assume server-side uniqueness guarantees beyond
  what the client provides.
- **One row per verification call**, not per tap. A retry produces a **new row** with the
  same `session_id` and an incremented `attempt_number`.
- **`audio_storage_path` is a storage key, not a URL.** Resolve it to a signed URL at read
  time (server-side, TTL ≤ 900s). Never store full URLs in the DB.
- **Row insert can succeed even when `audio_storage_path` is `NULL`** (the audio upload can
  fail independently of the row insert). Always treat audio as optional.
- **Rows are written from real devices.** Simulator runs typically skip the save, so
  `isSimulator = true` rows are rare/absent by design.

---

## 11. Reference queries (read-only)

```sql
-- All attempts for a child, newest first
select * from public.child_pronunciation_attempt
where child_id = '<uuid>'
order by recorded_at desc;

-- Retries within one lesson step
select * from public.child_pronunciation_attempt
where session_id = 'pron-1782121407706-vvlecr'
order by attempt_number;

-- Attempts missing audio
select id, session_id, attempt_number, audio_storage_path
from public.child_pronunciation_attempt
where audio_storage_path is null;
```
