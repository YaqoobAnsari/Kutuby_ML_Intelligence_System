-- 0004_dashboard_attempt_label.sql
--
-- ADDITIVE, human-gated (see supabase/README.md). Creates the dashboard-owned
-- table for HUMAN GROUND-TRUTH verdicts on attempts, used to curate retraining
-- sets. The production table public.child_pronunciation_attempt stays IMMUTABLE;
-- this table only references it. `is_correct` on the attempt is the MODEL's own
-- judgment — these labels are the human verdict that confirms or corrects it.
--
-- Apply via the Supabase SQL editor or `supabase db push` (do NOT auto-apply).
-- Once applied, the Data Curation page's verdict-capture UI activates.

create table if not exists public.dashboard_attempt_label (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.child_pronunciation_attempt (id) on delete cascade,
  -- Human verdict: did the child actually pronounce the target correctly?
  verdict     text not null check (verdict in ('correct', 'incorrect', 'unclear')),
  -- Optional free-text note and reviewer initials (no auth in the dashboard yet).
  note        text,
  reviewer    text,
  created_at  timestamptz not null default now(),
  -- One current label per attempt (re-labeling upserts on this key).
  unique (attempt_id)
);

create index if not exists dashboard_attempt_label_attempt_idx
  on public.dashboard_attempt_label (attempt_id);
create index if not exists dashboard_attempt_label_verdict_idx
  on public.dashboard_attempt_label (verdict);

-- Only the service role reads/writes this table (the dashboard has no end-user
-- auth). Enable RLS with no anon policy so it is closed by default.
alter table public.dashboard_attempt_label enable row level security;

comment on table public.dashboard_attempt_label is
  'Dashboard-owned human verdicts on child_pronunciation_attempt for dataset curation. Additive; production table is never modified.';
