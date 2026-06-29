# Implementation Plan — Kutuby ML Intelligence Dashboard

> Internal, **read-only** ML observability platform for Kutuby's two production
> pronunciation models (Arabic letters + Quranic words). This document is the
> phased build plan and the single source of truth for stack, structure, the
> four locked governance decisions, the read-model strategy, the verification
> gate, and the open-risk register.
>
> **Scope guard:** This dashboard never writes to production data. The raw table
> `public.child_pronunciation_attempt` is **immutable** for us. See
> [`DATA-MODEL.md`](./DATA-MODEL.md) for our own additive schema and
> [`INTEGRATIONS.md`](./INTEGRATIONS.md) for external services and env vars.

---

## 1. Product summary

The dashboard turns the per-attempt verification log (one row per pronunciation
verification call) into observability for three audiences:

- **ML engineers** — failure modes, confidence behaviour, dataset balance.
- **Backend engineers** — latency, ingestion timing, storage/upload health.
- **Senior management** — high-level pass/fail trends and dataset growth.

It is also the seed of a **proprietary, human-labelled pronunciation dataset**
for future retraining (Phase 5), built additively on top of (never mutating)
the production log.

### Outcome taxonomy (used EVERYWHERE)

| Outcome  | Definition                         | Source                         |
| -------- | ---------------------------------- | ------------------------------ |
| `pass`   | `is_correct === true`              | model `result`                 |
| `fail`   | `is_correct === false`             | model `result`                 |
| `error`  | `is_correct === null`             | API/network failure            |

**"Retry" is NOT an outcome.** It is a *session-level* metric: the number of
attempts that share a `session_id` (tracked via `attempt_number`). Any UI that
shows "retry rate" computes it from session grouping, never from the outcome
enum. The shared types live in `src/types/domain.ts`
(`AttemptOutcome = 'pass' | 'fail' | 'error'`, `AttemptType = 'letter' | 'word'`).

---

## 2. Chosen stack (locked — do not deviate)

| Concern            | Choice                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Framework          | **Next.js 15** (App Router)                                         |
| UI runtime         | **React 19**                                                       |
| Language           | **TypeScript (strict)** — `any` is banned; use `unknown` + Zod      |
| Styling            | **Tailwind CSS v3**                                                 |
| Components         | Hand-written **shadcn/ui-style** primitives (Radix + CVA + `cn()`)  |
| Charts             | **Recharts**                                                       |
| Tables             | **@tanstack/react-table**                                           |
| Server state       | **@tanstack/react-query**                                           |
| URL state          | **nuqs** (typed URL search params)                                  |
| Validation         | **Zod** (tolerant `.passthrough()` for evolving model payloads)    |
| Data / Auth / Files| **@supabase/supabase-js** + **@supabase/ssr**                       |
| Dates              | **date-fns**                                                       |
| Icons              | **lucide-react**                                                   |
| Testing            | **Vitest** + **@testing-library/react**                            |

**Conventions:** named exports only; concise JSDoc on every exported symbol;
2-space indentation; import via the `@/*` alias (maps to `./src/*`).

---

## 3. Directory structure

```
ML Intelligence Dashboard/
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md      ← this file
│  ├─ DATA-MODEL.md               ← our additive schema (audit + curation)
│  ├─ INTEGRATIONS.md             ← Cloud Run / Supabase / HF / env vars
│  ├─ ARCHITECTURE.md  DASHBOARD.md  PROJECT.md  STORAGE.md  (legacy notes)
│  └─ DATABASE.pdf                ← production schema reference (read-only)
├─ supabase/
│  ├─ README.md                   ← "NOT auto-applied; requires human sign-off"
│  └─ migrations/                 ← ADDITIVE read-only views + RPCs + audit table
├─ src/
│  ├─ app/                        ← App Router
│  │  ├─ (auth)/                  ← sign-in, allowlist gate
│  │  ├─ (dashboard)/
│  │  │  ├─ overview/             ← Phase 1  Executive Overview
│  │  │  ├─ explorer/             ← Phase 2  Dataset Explorer
│  │  │  ├─ intelligence/         ← Phase 3  Model Intelligence
│  │  │  ├─ quality/              ← Phase 3  Dataset Quality
│  │  │  ├─ storage/              ← Phase 4  Storage & Infrastructure
│  │  │  └─ curation/             ← Phase 5  Data Curation + export
│  │  └─ api/                     ← route handlers (signed URLs, exports)
│  ├─ components/
│  │  ├─ ui/                      ← shadcn-style primitives (button, card, …)
│  │  └─ charts/                  ← Recharts wrappers
│  ├─ server/                     ← SERVER-ONLY data layer (service-role client)
│  │  ├─ supabase/                ← admin + ssr client factories
│  │  ├─ queries/                 ← read-model functions (per view/RPC)
│  │  ├─ audit/                   ← dashboard_audit_log writers
│  │  └─ audio/                   ← signed-URL minting (TTL ≤ 900s)
│  ├─ lib/                        ← cn(), formatters, outcome helpers
│  ├─ types/                      ← domain.ts (shared types), zod schemas
│  └─ test/                       ← Vitest setup + fixtures
├─ .env.example
└─ package.json
```

---

## 4. The four locked governance decisions

These are first-class because this is **children's audio data**.

1. **Outcome taxonomy.** `pass` / `fail` / `error` as defined in §1. Retry is a
   session metric, never an outcome. Enforced through `src/types/domain.ts` and
   shared helpers — no page recomputes the mapping ad hoc.

2. **Auth + RBAC.** Supabase Auth with an internal **email allowlist**
   (`DASHBOARD_ALLOWLIST_EMAILS`, comma-separated). Roles:
   - `viewer` — aggregates only.
   - `analyst` — aggregates **+ raw rows + audio playback**.
   - `admin` — everything (incl. exports, curation writes).
   Audio playback requires `analyst` or `admin`. Role checks run **server-side**;
   the client never receives data it is not entitled to.

3. **SQL is additive, read-only, and human-gated.** Our SQL lives in
   `supabase/migrations/*` as **views/RPCs** over the production table plus our
   own `dashboard_audit_log`. These are **NOT auto-applied** to production — they
   require human sign-off (stated in `supabase/README.md`). The raw table
   `public.child_pronunciation_attempt` is **immutable**; we never write to it.
   The dashboard reads it via the **service-role key, server-side only** (the
   production RLS is parent-scoped and useless for internal staff).

4. **Audio governance.** Signed audio URLs are minted **server-side only**, with
   **TTL ≤ 900s**, and are **never persisted** to the DB. **Every** raw-row read
   and **every** audio access is recorded in `dashboard_audit_log`
   (`list_attempts`, `view_attempt`, `play_audio`, `export`).

---

## 5. Read-model strategy (views now → materialized views later)

**Now (Phase 1–4): plain SQL views + RPCs.** Aggregations (pass/fail/error
rates, by-target counts, daily growth, latency percentiles, confidence
histograms) are expressed as additive views over
`public.child_pronunciation_attempt`. Benefits: zero duplicated data, always
fresh, trivially reversible, no scheduled refresh to operate. The dashboard's
server query layer (`src/server/queries/*`) calls these views / typed RPCs with
the service-role client.

**Indexes available today:** `child_id`, `session_id`, `recorded_at desc`. The
read models are designed around these — time-series use `recorded_at`, session
grouping uses `session_id`.

**Upgrade path (when volume hurts): materialized views.** If view latency
degrades at scale, promote the heaviest aggregates (daily growth, by-target
balance, confidence histograms) to **materialized views** refreshed on a
schedule (e.g. `pg_cron`, `REFRESH MATERIALIZED VIEW CONCURRENTLY`). The query
layer's function signatures stay identical — only the underlying object changes —
so no app code is rewritten. Materialization is **deferred until measured**, not
adopted speculatively. Any such change still follows decision #3 (additive,
human-signed-off migration).

**Tolerant parsing.** `model_output` and `client_context` evolve, so all JSON is
parsed with Zod `.passthrough()` schemas. Unknown/new fields never crash a page.

---

## 6. Phased plan

### Phase 0 — Docs + decisions  *(DONE now)*
- This plan, `DATA-MODEL.md`, `INTEGRATIONS.md`.
- Lock the four governance decisions and the outcome taxonomy.

### Phase 1 — Scaffold + server data layer + auth/audit + Executive Overview  *(DONE now)*
- Next.js 15 scaffold, Tailwind, UI primitives, `cn()`, query/nuqs providers.
- `src/types/domain.ts` shared types; tolerant Zod schemas for the two payloads.
- Server-only Supabase clients (service-role admin + SSR auth).
- Auth + allowlist gate + RBAC role resolution.
- `dashboard_audit_log` writer; first additive views (overview aggregates).
- **Executive Overview** page: totals, pass/fail/error rates, daily growth,
  attempts-vs-attempts-with-audio, top targets — aggregates only (viewer-safe).

### Phase 2 — Dataset Explorer + audio
- `@tanstack/react-table` grid over raw rows (analyst/admin only), nuqs-driven
  filters (date, target, attempt_type, outcome, confidence, session).
- Per-row detail: expected target, prediction, confidence (per-model), timestamp,
  storage path, `attempt_number`/session context.
- Server-side **signed-URL** route (TTL ≤ 900s) + audio player; every list,
  view, and play writes to `dashboard_audit_log`.

### Phase 3 — Model Intelligence + Dataset Quality
- **Model Intelligence:** per-model confidence distributions (letters vs words on
  **separate axes**, with the word-confidence **uncalibrated** caveat),
  prediction-vs-target behaviour, latency percentiles, failure clustering.
- **Dataset Quality:** dataset balance by target, error-rate hotspots,
  speech-detected / recording-duration health, audio-missing rate.

### Phase 4 — Storage & Infrastructure
- Bucket `pronunciation-recordings` usage, upload-failure (NULL path) rate,
  ingestion timing (`created_at` vs `recorded_at`), per-target storage footprint.

### Phase 5 — Data Curation + retraining export
- Human-label workflow on top of a **new additive curation table** (verdict,
  reviewer, status, train/val/test split — sketched in `DATA-MODEL.md`).
- Curation writes go to **our** table only; production stays immutable.
- Audited retraining **export** (admin only; `export` action logged).

---

## 7. Feasibility flags (must be honored in metrics + UI)

- **Model version is NOT captured per attempt** → any "model version" feature is
  **BLOCKED**. Render it **disabled** with a "not captured yet" note; never
  fabricate it. (Version lives only as a Cloud Run env var — see
  `INTEGRATIONS.md`.) Note this contradicts the legacy `DASHBOARD.md` wishlist;
  the feasibility flag wins.
- **Letter vs word confidence are different scales/semantics**, and word
  confidence is **uncalibrated** → never blend them on one axis; always per-model
  with a calibration caveat.
- **A row can have `audio_storage_path = NULL`** (upload failed) → always
  distinguish "attempts" from "attempts with audio".
- **Time semantics:** `recorded_at` for behavioural time-series; `created_at` for
  ingestion timing.

---

## 8. Testing / verification gate

The Foundation and Verify stages own `npm install`, `next build`, lint, and
tests — individual feature tasks must **not** run them.

The verification gate (owned by the Verify stage) requires:

1. `npm install` clean.
2. `tsc --noEmit` passes with **strict** and **zero `any`**.
3. ESLint passes (named-exports, import-alias, no server-only leakage to client).
4. `next build` succeeds.
5. **Vitest** green — unit coverage on: outcome mapping, retry/session
   aggregation, tolerant Zod parsing (incl. failure `{ error }` payloads),
   signed-URL TTL ≤ 900s, RBAC gate (viewer cannot reach raw rows/audio), and the
   audit-writer (every raw/audio access logs an entry).
6. Manual smoke: each phase's pages render with seeded fixtures; no service-role
   key or signed URL is ever exposed to the client bundle.

---

## 9. Risks & open decisions

| # | Risk / open decision | Mitigation / status |
| - | -------------------- | ------------------- |
| R1 | Model version absent per attempt blocks version analytics | Feature disabled + "not captured yet" note; propose backend captures version into `client_context` or `model_output` going forward |
| R2 | Word confidence uncalibrated; blending misleads | Per-model axes + persistent calibration caveat |
| R3 | Service-role key leakage | Server-only data layer; key never imported in client components; lint/build check |
| R4 | View latency at scale | Materialized-view upgrade path (§5), deferred until measured |
| R5 | Children's-audio exposure | Signed URLs server-only, TTL ≤ 900s, never persisted; all access audited; RBAC gating |
| R6 | Production-schema drift / immutability | Read-only views; never write raw table; additive migrations human-signed-off |
| R7 | Storage cost/lifecycle (legacy `STORAGE.md` decision) | Bucket `pronunciation-recordings` is the source of truth now; Phase 4 surfaces footprint to inform any future lifecycle policy |
| O1 | Curation schema (verdict/status/split enums) final shape | Sketched in `DATA-MODEL.md`; finalized at Phase 5 with ML team |
| O2 | Export format/target for retraining | Decided at Phase 5; admin-only + audited |
| O3 | Allowlist administration (who edits `DASHBOARD_ALLOWLIST_EMAILS`) | Ops process to define before GA |
