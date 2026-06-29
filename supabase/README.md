# Supabase — additive, read-only migrations (HUMAN SIGN-OFF REQUIRED)

Everything under `supabase/migrations/*` is **additive** and **read-only with
respect to production**. These objects exist **beside** the immutable production
table `public.child_pronunciation_attempt` — they never mutate it.

> **These migrations are NOT auto-applied to the production Supabase project.**
> They must be applied **only with explicit human sign-off.** There is no CI step
> that pushes them. A human reviews the SQL and applies it deliberately.

## Why human-gated?

This system handles **children's audio data**. The production table is the system
of record for live pronunciation traffic and is **immutable** for the dashboard:
no `INSERT` / `UPDATE` / `DELETE` / `UPSERT` against
`public.child_pronunciation_attempt` or the `pronunciation-recordings` bucket,
ever. Our objects only `SELECT` from production (views/RPCs) or write to our own
audit table. Applying schema changes to a production project that serves children
is a deliberate, reviewed act — never automated.

## What's here

| File | What it creates | Writes to production? |
| ---- | --------------- | --------------------- |
| `migrations/0001_dashboard_views.sql` | `dash_attempt_flat`, `dash_daily_metrics`, `dash_target_metrics` — read-only views (with `security_invoker`) over the production table, projecting hot JSONB fields and the canonical `pass`/`fail`/`error` outcome. | No — `SELECT` only. |
| `migrations/0002_dashboard_audit_log.sql` | `dashboard_audit_log` — **our** table (the only thing we write). RLS enabled with **no policies**, so only the service role (server-side) can read/write it. | No — it is our own additive table, not production data. |
| `migrations/0003_dashboard_rpc.sql` | `dashboard_weak_targets(...)` — optional read-only `SECURITY INVOKER` helper RPC over `dash_target_metrics`. | No — `SELECT` only. |

Apply them **in order**: `0001` → `0002` → `0003` (the RPC depends on the views).

## How to apply (after sign-off)

Pick one; both require a human with production access.

**Option A — Supabase CLI (recommended):**

```bash
# Link once (interactive; uses your Supabase access token):
supabase link --project-ref <PROD_PROJECT_REF>

# Review the diff, then push the migrations in this folder:
supabase db push
```

**Option B — SQL editor (manual):**

Open the Supabase dashboard → **SQL Editor**, paste the contents of each file in
`0001` → `0002` → `0003` order, review, and run. The statements are idempotent
(`create or replace view`, `create table if not exists`,
`create index if not exists`, `create or replace function`), so re-running is
safe.

After applying, confirm the dashboard's server env points at this project
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and that
`grep -r "SERVICE_ROLE" src/` only hits server-only modules.

## Read-model strategy: views now → materialized views later

**Now (Phase 1–4): plain SQL views + RPC.** Aggregations (daily growth, per-target
balance, outcome rates) are expressed as additive views over the production table.
Benefits: zero duplicated data, always fresh, trivially reversible, nothing to
schedule. The server query layer reads these with the service-role client,
server-side only.

**Upgrade path (deferred until measured): materialized views.** If view latency
degrades at scale, promote the heaviest aggregates (`dash_daily_metrics`,
`dash_target_metrics`) to **materialized views** refreshed on a schedule, e.g.:

```sql
-- Example (a FUTURE additive, human-signed-off migration — not applied here):
create materialized view public.dash_daily_metrics_mv as
  select * from public.dash_daily_metrics;
create unique index on public.dash_daily_metrics_mv (day);
-- Refresh on a schedule (e.g. pg_cron):
refresh materialized view concurrently public.dash_daily_metrics_mv;
```

Because the column contract (and `dashboard_weak_targets`'s signature) stays
identical, **no application code changes** when the underlying object is
materialized. Materialization is adopted only when measured, and ships as its own
additive, human-signed-off migration.

## Non-negotiables recap

1. Production table and storage bucket are **read-only**; we only ever `SELECT` /
   mint short-lived signed URLs.
2. All our SQL is **additive**, lives here, is **NOT auto-applied**, and is
   **human-signed-off** before reaching production.
3. Production is read with the **service-role key, server-side only** (production
   RLS is parent-scoped and useless for internal staff).
4. Every raw-row / audio access is recorded in `dashboard_audit_log`. Signed URLs
   (TTL <= 900s) are **never** persisted.
