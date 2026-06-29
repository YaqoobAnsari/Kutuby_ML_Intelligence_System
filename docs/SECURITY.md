# Security & Data Governance

> **⚠️ STATUS (2026-06-29): Auth, RBAC, and audit logging are DEFERRED in the
> current build.** Per team decision, login/auth was removed to focus on the
> dashboard itself; Supabase is accessed with a hardcoded service-role key,
> server-side (`src/lib/supabase/config.ts`). The model below describes the
> **intended production posture** to re-introduce before any non-trusted access.
> Until then, network-level controls (private deployment / VPN / IP allowlist)
> are the only access barrier — keep the deployment private.

> Scope: the **Kutuby ML Intelligence Dashboard** — an internal, read-only ML
> observability tool for our pronunciation models.
>
> **This dashboard exposes recordings of CHILDREN to internal staff.** Treat every
> control in this document as load-bearing, not optional. Security and audit are
> first-class requirements, not afterthoughts. When in doubt, fail closed.

---

## 1. Threat model in one paragraph

The sensitive asset is a corpus of audio recordings of children practising
Arabic letters and Quranic words, together with the metadata that links each
recording to a `child_id`. The primary risks are: (a) leakage of the Supabase
**service-role key** (which bypasses RLS and grants full read of production), (b)
unauthenticated or over-privileged staff viewing raw rows or listening to child
audio, (c) signed audio URLs escaping into logs/caches/the browser history and
being replayed, and (d) absence of an access trail when a child or regulator
asks "who listened to my child's recording?". Every section below maps to one of
these risks.

---

## 2. Service-role key: server-only, never in the browser

The dashboard reads production data with the Supabase **service-role key**
because production RLS is parent-scoped (`auth.uid() = child_user.parent_id`) and
therefore useless for internal staff. This key bypasses RLS entirely.

**Rules (non-negotiable):**

- [ ] The service-role key is referenced **only** in server-side code (Route
      Handlers, Server Components, Server Actions, server-only utility modules).
- [ ] It is stored in `SUPABASE_SERVICE_ROLE_KEY` — **without** the `NEXT_PUBLIC_`
      prefix. Any `NEXT_PUBLIC_*` var is inlined into the client bundle.
- [ ] The Supabase **admin client** (service-role) is created in a module that
      starts with `import 'server-only'` so a stray client import fails the build.
- [ ] The service-role key is **never** passed as a prop, returned in an API JSON
      body, embedded in HTML, or written to logs.
- [ ] The browser only ever talks to **our** API routes. It never holds Supabase
      credentials of any kind (not even the anon key needs to do privileged work).
- [ ] Key rotation is possible without a code change (env-only). Rotate on any
      suspected exposure and on staff offboarding with infra access.

**Verification checklist before any deploy:**

- [ ] `grep -r "SERVICE_ROLE" src/` returns hits **only** in server-only files.
- [ ] No `NEXT_PUBLIC_*SERVICE*` or `NEXT_PUBLIC_*SECRET*` env vars exist.
- [ ] Built client bundle does not contain the key (search the `.next` output).

---

## 3. Authentication: Supabase Auth + internal email allowlist

Identity is established by **Supabase Auth**. Authorization to use the dashboard
at all is gated by an **internal email allowlist**.

- [ ] Allowlist source of truth: env `DASHBOARD_ALLOWLIST_EMAILS`
      (comma-separated, lower-cased on compare).
- [ ] A signed-in Supabase user whose email is **not** on the allowlist is treated
      as unauthenticated — no data, redirect to a "not authorized" page.
- [ ] The allowlist is enforced **server-side** on every request (middleware +
      per-route check). Never trust a client-provided email.
- [ ] Sessions use Supabase SSR cookies (`@supabase/ssr`); cookies are
      `HttpOnly`, `Secure`, `SameSite=Lax` (or stricter).
- [ ] Prefer corporate SSO / OAuth or magic-link over passwords; if passwords are
      allowed, enforce MFA for `admin`.
- [ ] Offboarding: removing an email from `DASHBOARD_ALLOWLIST_EMAILS` immediately
      revokes access on the next request, independent of session expiry.

---

## 4. RBAC — roles and exactly what each can see

Three roles, strictly additive in capability. Role is resolved server-side from
trusted config (mapped to the authenticated email), **never** from the client.

| Capability                                   | viewer | analyst | admin |
| -------------------------------------------- | :----: | :-----: | :---: |
| Aggregate metrics / charts (no PII)          |   ✅   |   ✅    |  ✅   |
| Raw attempt rows (per-row detail)            |   ❌   |   ✅    |  ✅   |
| Audio playback (signed URL minting)          |   ❌   |   ✅    |  ✅   |
| Exports (raw rows / audio references)        |   ❌   |   ✅*   |  ✅   |
| View `dashboard_audit_log`                   |   ❌   |   ❌    |  ✅   |
| Manage allowlist / roles / settings          |   ❌   |   ❌    |  ✅   |

`*` Analyst export is permitted but **fully audited** (see §6). Leadership may
choose to restrict export to `admin` only — flag in §8.

**Role definitions:**

- **viewer** — Aggregates only. Sees counts, rates (PASS/FAIL/ERROR per the locked
  taxonomy), distributions, time-series. Never sees an individual `child_id`,
  individual transcription, raw `model_output`, audio, or any per-row identifier.
- **analyst** — Everything a viewer sees, **plus** raw attempt rows (including
  `child_id`, `target_*`, parsed `model_output`/`client_context`) **and** audio
  playback. This is the level that touches children's PII and voice.
- **admin** — Everything an analyst sees, **plus** the audit log, allowlist/role
  management, and any administrative settings.

**Rules:**

- [ ] Authorization is enforced on the **server** for every endpoint. A `viewer`
      hitting a raw-rows or audio endpoint gets `403`, not a filtered `200`.
- [ ] Aggregate endpoints return **no row-level identifiers** even to admins by
      accident — aggregation happens in SQL/RPC, not by trimming in the client.
- [ ] Default role for a newly-allowlisted email is the **least** privilege
      (`viewer`). Elevation is an explicit admin action.
- [ ] UI hides controls a role cannot use, but the **server** is the real gate
      (defense in depth — hidden ≠ protected).

---

## 5. Audio access — short-lived, server-minted, never persisted signed URLs

Recordings live in the **private** Supabase Storage bucket
`pronunciation-recordings` at key `{child_id}/{session_id}/{attempt_number}.wav`.
`audio_storage_path` is a **storage key, not a URL**. A row may have
`audio_storage_path = NULL` (upload failed) — surface "no audio" cleanly.

**Rules:**

- [ ] Signed URLs are minted **server-side only**, via
      `supabase.storage.from('pronunciation-recordings').createSignedUrl(path, ttl)`.
- [ ] TTL is **≤ 900 seconds** (15 min). Use the shortest TTL the player tolerates;
      prefer 60–300s.
- [ ] Signed URLs are **never written to the database**, never cached, never logged,
      never embedded in server-rendered HTML that is cached. They are returned to
      the authorized client on demand and then discarded.
- [ ] Minting requires role `analyst` or `admin`. A `viewer` cannot mint, full stop.
- [ ] The caller must be authenticated, allowlisted, and authorized **before** the
      URL is minted; the storage key is validated against an attempt the caller is
      permitted to see.
- [ ] Every mint is recorded in `dashboard_audit_log` (action `play_audio`) **before**
      the URL is returned — log first, then serve.
- [ ] Do **not** make the bucket public, and do **not** add long-lived CDN caching
      in front of signed URLs.

---

## 6. Audit logging — `dashboard_audit_log`

Every access to children's data leaves a trail. The audit log is **ours**
(additive), separate from the immutable production table.

**Table `dashboard_audit_log`:**

| Column        | Type          | Notes                                             |
| ------------- | ------------- | ------------------------------------------------- |
| `id`          | uuid PK       | `default gen_random_uuid()`                       |
| `actor_email` | text NOT NULL | who acted                                          |
| `actor_role`  | text          | role at time of action                            |
| `action`      | text NOT NULL | `list_attempts` \| `view_attempt` \| `play_audio` \| `export` |
| `attempt_id`  | uuid          | the attempt touched (nullable for list/aggregate) |
| `target_path` | text          | storage key for audio actions                     |
| `metadata`    | jsonb NOT NULL| `default '{}'::jsonb` (filters, counts, context)  |
| `created_at`  | timestamptz   | `default now()`                                   |

Indexes: `(created_at desc)`, `(actor_email)`.

**What is logged, and when:**

- [ ] **Raw-row access** — listing or viewing individual attempts
      (`list_attempts`, `view_attempt`): actor, role, the attempt(s)/filters touched.
- [ ] **Audio access** — every signed-URL mint (`play_audio`): actor, role,
      `attempt_id`, `target_path`. Logged **before** the URL is handed out.
- [ ] **Exports** (`export`): actor, role, filter criteria and row count in
      `metadata`.
- [ ] Aggregate-only views by a `viewer` need not be logged per-row, but logging
      session/login events is encouraged.

**Rules:**

- [ ] The log is **append-only** from the app's perspective — the app never updates
      or deletes audit rows.
- [ ] Logging happens server-side, in the same request that performs the access; a
      failure to log should fail the request closed for audio/raw access.
- [ ] Reading the audit log is **admin-only** (§4).
- [ ] Never put the actual **signed URL** or any secret into `metadata` — only the
      storage **key** (`target_path`) and non-sensitive context.
- [ ] Define a retention window for the audit log itself (see §8 — OPEN).

---

## 7. Production data is immutable

The raw production table `public.child_pronunciation_attempt` is the system of
record for live pronunciation traffic. **The dashboard never writes to it.**

- [ ] The dashboard performs **read-only** queries against production.
- [ ] No `INSERT` / `UPDATE` / `DELETE` / `UPSERT` against
      `public.child_pronunciation_attempt` or the `pronunciation-recordings` bucket.
- [ ] Our SQL lives in `supabase/migrations/*` as **additive, read-only** views/RPCs
      plus the `dashboard_audit_log` table. These are **not** auto-applied to
      production; they require **human sign-off** (documented in `supabase/README.md`).
- [ ] Use `recorded_at` for behavioral time-series and `created_at` for ingestion
      timing — do not conflate them.
- [ ] Honor the feasibility flags: `model_version` is **not** captured per attempt
      (any model-version feature is BLOCKED — render disabled, never fabricate);
      letter vs word confidence are different, uncalibrated scales (never blend);
      distinguish "attempts" from "attempts with audio".

---

## 8. Compliance considerations — **OPEN (leadership decision required)**

These items are **not** engineering decisions. They are flagged here, marked
**OPEN**, and require a documented decision from leadership / legal before this
dashboard handles production child data at scale. Engineering has built the
technical controls (allowlist, RBAC, signed URLs, audit log, immutability) to
*support* whatever policy is chosen, but the policy itself is undecided.

- [ ] **COPPA (US, under-13)** — **OPEN.** Confirm lawful basis and verifiable
      parental consent covers internal staff review of recordings for model
      observability/retraining. Confirm data-minimization and access limits meet
      COPPA's "reasonable security" bar. *Owner: Legal/Leadership.*
- [ ] **GDPR-K (EU children's data) / UK Age-Appropriate Design** — **OPEN.**
      Establish lawful basis (Art. 6) and explicit handling for special-category /
      children's data; document DPIA; confirm staff-access purpose limitation and
      international-transfer posture (where is the data, where are staff).
      *Owner: Legal/DPO.*
- [ ] **Consent** — **OPEN.** Does existing parental consent at capture time
      explicitly cover (a) internal staff listening to recordings, (b) building a
      proprietary dataset, and (c) future model retraining? If not, consent flow
      or a separate lawful basis is required. *Owner: Legal/Product.*
- [ ] **Retention policy** — **OPEN.** Define retention/TTL for: recordings,
      attempt rows, and the `dashboard_audit_log`. Define deletion/anonymization
      procedure and how it propagates from production to any derived dataset.
      *Owner: Leadership/Data.*
- [ ] **Data-subject / parental requests** — **OPEN.** Define the process for
      access, deletion, and "who listened to my child's audio?" requests (the audit
      log is designed to answer the last one). *Owner: Legal/Support.*
- [ ] **Sub-processors & residency** — **OPEN.** Confirm Supabase (and any host)
      region, DPA, and sub-processor list satisfy the chosen regime.
      *Owner: Legal/Infra.*

> Until these are resolved, treat access as privileged and exceptional: smallest
> possible analyst pool, shortest audio TTL, and full audit retention.

---

## 9. Pre-deploy security checklist (quick reference)

- [ ] Service-role key server-only; absent from client bundle (§2).
- [ ] Allowlist enforced server-side on every request (§3).
- [ ] RBAC enforced server-side; `viewer` cannot reach raw rows or audio (§4).
- [ ] Audio URLs minted server-side, TTL ≤ 900s, never persisted/logged (§5).
- [ ] `play_audio`, `view_attempt`, `list_attempts`, `export` all audited (§6).
- [ ] No write paths to production table or storage bucket (§7).
- [ ] Compliance items (§8) reviewed; any blocking OPEN item escalated.
- [ ] Secrets only in env; cookies `HttpOnly`/`Secure`/`SameSite`; HTTPS enforced.
