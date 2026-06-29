-- 0002_dashboard_audit_log.sql
--
-- Our OWN additive table — the only table the dashboard WRITES to. It records
-- every privileged access to children's data (governance decision #4). It sits
-- BESIDE the immutable production table and never references it via FK
-- (attempt_id is a value reference only).
--
-- ADDITIVE and human-gated like every migration here: NOT auto-applied to
-- production (see supabase/README.md).
--
-- Access model: RLS is ENABLED with NO policies, so anon/authenticated roles can
-- neither read nor write it. Only the Supabase SERVICE ROLE (which bypasses RLS)
-- writes and reads this table, exclusively from server-side dashboard code.
-- The table is append-only from the app's perspective: the app never UPDATEs or
-- DELETEs audit rows.

create table if not exists public.dashboard_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_email text        not null,
  actor_role  text,                                   -- 'viewer' | 'analyst' | 'admin' (role at time of action)
  action      text        not null,                   -- 'list_attempts' | 'view_attempt' | 'play_audio' | 'export'
  attempt_id  uuid,                                   -- value reference to child_pronunciation_attempt.id (no FK)
  target_path text,                                   -- storage KEY for audio actions (never a signed URL)
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists dashboard_audit_log_created_at_idx
  on public.dashboard_audit_log (created_at desc);

create index if not exists dashboard_audit_log_actor_email_idx
  on public.dashboard_audit_log (actor_email);

-- Fail closed: lock the table down to the service role only.
alter table public.dashboard_audit_log enable row level security;

comment on table public.dashboard_audit_log is
  'Append-only audit trail of privileged dashboard access (raw rows, audio, exports). RLS enabled with NO policies: only the service role (server-side) may write/read. Signed URLs are NEVER stored here — only the storage key in target_path.';
comment on column public.dashboard_audit_log.action is
  'Audited action vocabulary: list_attempts | view_attempt | play_audio | export (extend additively).';
comment on column public.dashboard_audit_log.target_path is
  'Storage KEY for audio actions only. The minted signed URL (TTL <= 900s) is never persisted.';
