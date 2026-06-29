-- 0003_dashboard_rpc.sql
--
-- OPTIONAL helper read-only RPC(s) for parameterized aggregates. ADDITIVE and
-- human-gated like every migration here (see supabase/README.md). All functions
-- are SECURITY INVOKER and STABLE — they only read, never write.

-- =============================================================================
-- dashboard_weak_targets — top targets by combined fail+error rate, with a
-- minimum-volume floor, separated by attempt_type. Reads the dash_target_metrics
-- view (additive, read-only). The server data layer may call this instead of
-- reading the view directly; the contract (column names) stays stable so the
-- view can later be promoted to a materialized view without app changes.
-- =============================================================================
create or replace function public.dashboard_weak_targets(
  min_volume     int  default 20,
  p_attempt_type text default null,
  p_limit        int  default 50
)
returns table (
  attempt_type    text,
  target          text,
  total           bigint,
  pass            bigint,
  fail            bigint,
  error           bigint,
  pass_rate       numeric,
  fail_error_rate numeric
)
language sql
stable
security invoker
as $$
  select
    t.attempt_type,
    t.target,
    t.total,
    t.pass,
    t.fail,
    t.error,
    t.pass_rate,
    t.fail_error_rate
  from public.dash_target_metrics t
  where t.total >= greatest(min_volume, 0)
    and (p_attempt_type is null or t.attempt_type = p_attempt_type)
  order by t.fail_error_rate desc nulls last, t.total desc
  limit greatest(p_limit, 0);
$$;

comment on function public.dashboard_weak_targets(int, text, int) is
  'Read-only: top targets by fail+error rate with a minimum-volume floor, optionally filtered by attempt_type. Reads dash_target_metrics. Additive helper.';
