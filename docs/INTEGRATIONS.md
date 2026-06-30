# Integrations — Kutuby ML Intelligence Dashboard

> Operational reference for every external service the dashboard touches:
> the two Cloud Run model APIs, Supabase (DB + Auth + Storage), the HuggingFace
> model repos, and the environment variables the dashboard needs.
>
> The dashboard is **read-only** with respect to all of these. It observes the
> models' *recorded outputs* (via Supabase); it does not call the verify
> endpoints itself in normal operation — the mobile app does. The endpoints are
> documented here for provenance and to explain why **model version is not in the
> dataset**.

---

## 1. Cloud Run — model inference services

**GCP project:** `organic-duality-484219-p5` · **Region:** `europe-west1`.

| Service             | Model family                       | Verify endpoint (path)        | `attempt_type` |
| ------------------- | ---------------------------------- | ----------------------------- | -------------- |
| `arabic-letters-api`| Arabic letters (Wav2Vec-based)     | `POST …/verify_letter`        | `letter`       |
| `arabic-words-api`  | Quranic words (Tarteel fine-tuned) | `POST …/verify_word`          | `word`         |

### Service URLs & consoles

**Quranic words** (`arabic-words-api`):
- Live API: `https://arabic-words-api-d26k2plh4q-ew.a.run.app` — `POST /verify_word`, health `GET /health` (returns `variant`/`model_name`).
- Cloud Run console: `https://console.cloud.google.com/run/detail/europe-west1/arabic-words-api/metrics?project=organic-duality-484219-p5`
- Model: **Tarteel** `tarteel-ai/whisper-base-ar-quran` (`MODEL_VARIANT=tarteel`), **baked into the container image** at build — no runtime GCS model bucket.

**Arabic letters** (`arabic-letters-api`):
- Live API: `https://arabic-letters-api-d26k2plh4q-ew.a.run.app` — `POST /verify_letter`; no `/health` (use `GET /`).
- Cloud Run console: `https://console.cloud.google.com/run/detail/europe-west1/arabic-letters-api/metrics?project=organic-duality-484219-p5`
- Model: 28-class Wav2Vec2, loaded at runtime from GCS bucket `kutuby-arabic-letters-models`.

### Response payloads (recorded into `model_output`)

- **`verify_letter`** → `result`(bool), `predicted_letter`,
  `predicted_probability`(0..1), `target_probability`(0..1), `confidence`(0..100),
  `transcription`, `similarity`, `message`, `processing_time_ms`, `model`,
  `variant`.
- **`verify_word`** → `result`(bool), `similarity`, `confidence`(0..100),
  `transcription`, `message`, `decision_basis`, `decision_threshold`,
  `threshold_param_applied`.
- **Failure** → `{ "error": "<message>" }` (the attempt's `is_correct` is then
  `NULL` → outcome `error`).

> **Confidence caveat:** letter confidence and word confidence are **different
> scales and semantics**, and **word confidence is uncalibrated**. The dashboard
> never blends them on one axis — always per-model, with a calibration caveat.

### Model version lives ONLY as a Cloud Run env var (NOT in the dataset)

Each service carries its version as a **deployment-time environment variable**:

| Service             | Version env var               | Example value |
| ------------------- | ----------------------------- | ------------- |
| `arabic-letters-api`| `MODEL_VERSION`               | (deploy-set)  |
| `arabic-words-api`  | `MODEL_VARIANT`               | `tarteel`     |

Because the version is a property of the **running revision**, not of each
inference, it is **never written per attempt** into
`public.child_pronunciation_attempt`. Therefore:

- Any "model version" analytics in the dashboard are **BLOCKED** — render the
  control **disabled** with a **"not captured yet"** note.
- **Never fabricate** a version from `model_output.model` / `variant` (those are
  free-form labels, not a guaranteed version contract).
- **Remediation (future, backend-owned):** have each service stamp its
  `MODEL_VERSION` / `MODEL_VARIANT` into `model_output` (or `client_context`) at
  inference time. Once present per attempt, the dashboard can light up version
  analytics. Until then it stays disabled.

---

## 2. Supabase — DB + Auth + Storage

One Supabase project provides all three:

### Database
- Production source table `public.child_pronunciation_attempt` (read-only to us;
  see `DATA-MODEL.md`).
- Our additive `dash_*` views/RPCs + `dashboard_audit_log` (+ Phase 5 curation).
- Production **RLS is parent-scoped** (`auth.uid() = child_user.parent_id`),
  which is useless for internal staff → the dashboard reads with the
  **service-role key, server-side only**.

### Auth
- Supabase Auth + an internal **email allowlist**
  (`DASHBOARD_ALLOWLIST_EMAILS`). RBAC roles: `viewer` / `analyst` / `admin`.
  Audio playback requires `analyst` or `admin`. Enforced server-side.

### Storage
- Private bucket **`pronunciation-recordings`**.
- Path format: `{child_id}/{session_id}/{attempt_number}.wav` — WAV, 44.1kHz,
  mono. (`audio_storage_path` stores this **key**, not a URL; it may be `NULL`
  when upload failed.)
- Playback is via **server-side signed URLs**:
  `supabase.storage.from('pronunciation-recordings').createSignedUrl(path, ttlSeconds)`
  with **`ttlSeconds ≤ 900`**. Signed URLs are **never persisted**; every
  `play_audio` is recorded in `dashboard_audit_log`.

---

## 3. HuggingFace — model repositories

Provenance/reference for the deployed models (the dashboard does **not** call
HuggingFace at runtime):

- **Arabic letters** — Wav2Vec-based pronunciation model repo (served by
  `arabic-letters-api`).
- **Quranic words** — Tarteel fine-tuned model repo (served by
  `arabic-words-api`, `MODEL_VARIANT=tarteel`).

If a token is ever needed for offline model/asset retrieval, use
`HUGGINGFACE_TOKEN` (optional; not required for the read-only dashboard).

---

## 4. Environment variables the dashboard needs

Document these in `.env.example` (no real secrets committed). All secret-bearing
values are **server-only** — never expose them with the `NEXT_PUBLIC_` prefix.

| Variable                        | Scope         | Required | Purpose                                                        |
| ------------------------------- | ------------- | -------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server | yes      | Supabase project URL (Auth client + SSR)                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | yes      | Anon key for Auth (browser sign-in)                            |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only** | yes    | Read production + storage server-side; **never** in client     |
| `DASHBOARD_ALLOWLIST_EMAILS`    | server only   | yes      | Comma-separated internal email allowlist                       |
| `SUPABASE_STORAGE_BUCKET`       | server only   | optional | Defaults to `pronunciation-recordings`                         |
| `SIGNED_URL_TTL_SECONDS`  | server only   | optional | Signed-URL TTL; **must be ≤ 900** (default 900)                |
| `HUGGINGFACE_TOKEN`             | server only   | optional | Only if offline model/asset retrieval is needed                |

> **Reference only (NOT dashboard secrets):** the Cloud Run services'
> `MODEL_VERSION` / `MODEL_VARIANT` are configured **on those services**, not in
> the dashboard environment. They are listed in §1 to explain why version data is
> absent from the dataset — do not copy them into the dashboard `.env`.

### Hard rules
- `SUPABASE_SERVICE_ROLE_KEY` is imported **only** in `src/server/*`; it must
  never reach a client component or the browser bundle.
- `SIGNED_URL_TTL_SECONDS` is clamped to **≤ 900** in code regardless of
  the env value.
- GCP project `organic-duality-484219-p5` / region `europe-west1` are recorded
  for ops/provenance; the dashboard needs no GCP credentials for normal
  (read-only) operation.
