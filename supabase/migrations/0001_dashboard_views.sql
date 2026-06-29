-- 0001_dashboard_views.sql
--
-- ADDITIVE, READ-ONLY dashboard read models over the IMMUTABLE production table
-- public.child_pronunciation_attempt. These objects only SELECT; they never
-- INSERT/UPDATE/DELETE/UPSERT and must NEVER be auto-applied to production.
-- They require explicit human sign-off (see supabase/README.md).
--
-- Conventions:
--   * Outcome taxonomy (LOCKED): pass = is_correct true, fail = is_correct false,
--     error = is_correct null (API/network failure). There is no fourth bucket.
--   * Time semantics (LOCKED): recorded_at = behavioural series; created_at =
--     ingestion timing. Daily buckets below truncate in UTC for reproducibility.
--   * JSONB columns (model_output, client_context) are tolerant and evolving;
--     every numeric/boolean extraction uses a typeof-guarded "safe cast" so a
--     malformed value yields NULL instead of raising.
--   * Letter vs word confidence are DIFFERENT scales/semantics and word
--     confidence is UNCALIBRATED — never blended downstream (see docs/METRICS.md).
--   * Views use security_invoker so they respect the caller's privileges; the
--     dashboard reads them with the service-role key, server-side only.

-- =============================================================================
-- dash_attempt_flat — one row per attempt with hot JSONB fields projected to typed
-- columns. Raw model_output / client_context are retained so the server data
-- layer can still parse evolving fields tolerantly.
-- =============================================================================
create or replace view public.dash_attempt_flat
with (security_invoker = true) as
select
  cpa.id,
  cpa.child_id,
  cpa.session_id,
  cpa.attempt_number,
  cpa.attempt_type,
  cpa.target_display,
  cpa.target_sent_to_api,
  cpa.is_correct,
  -- Canonical outcome derivation (used everywhere).
  case
    when cpa.is_correct is true  then 'pass'
    when cpa.is_correct is false then 'fail'
    else 'error'
  end as outcome,
  -- Capture health: distinguish "attempts" from "attempts with audio".
  (cpa.audio_storage_path is not null) as has_audio,
  cpa.audio_storage_path,
  -- model_output projections (safe casts).
  (cpa.model_output ->> 'predicted_letter') as predicted_letter,
  case when jsonb_typeof(cpa.model_output -> 'confidence') = 'number'
       then (cpa.model_output ->> 'confidence')::numeric end as confidence,
  case when jsonb_typeof(cpa.model_output -> 'predicted_probability') = 'number'
       then (cpa.model_output ->> 'predicted_probability')::numeric end as predicted_probability,
  case when jsonb_typeof(cpa.model_output -> 'target_probability') = 'number'
       then (cpa.model_output ->> 'target_probability')::numeric end as target_probability,
  case when jsonb_typeof(cpa.model_output -> 'similarity') = 'number'
       then (cpa.model_output ->> 'similarity')::numeric end as similarity,
  case when jsonb_typeof(cpa.model_output -> 'processing_time_ms') = 'number'
       then (cpa.model_output ->> 'processing_time_ms')::numeric end as processing_time_ms,
  -- client_context projections (safe casts).
  case when jsonb_typeof(cpa.client_context -> 'apiLatencyMs') = 'number'
       then (cpa.client_context ->> 'apiLatencyMs')::numeric end as api_latency_ms,
  case when jsonb_typeof(cpa.client_context -> 'speechDetected') = 'boolean'
       then (cpa.client_context ->> 'speechDetected')::boolean end as speech_detected,
  case when jsonb_typeof(cpa.client_context -> 'recordingDurationMs') = 'number'
       then (cpa.client_context ->> 'recordingDurationMs')::numeric end as recording_duration_ms,
  case when jsonb_typeof(cpa.client_context -> 'httpStatus') = 'number'
       then (cpa.client_context ->> 'httpStatus')::numeric end as http_status,
  (cpa.client_context ->> 'platform') as platform,
  (cpa.client_context ->> 'appVersion') as app_version,
  -- Raw JSONB retained for tolerant downstream parsing / row detail.
  cpa.model_output,
  cpa.client_context,
  cpa.recorded_at,
  cpa.created_at
from public.child_pronunciation_attempt cpa;

comment on view public.dash_attempt_flat is
  'Read-only flattened projection of child_pronunciation_attempt with typed hot JSONB fields and derived outcome/has_audio. Additive; never written to.';

-- =============================================================================
-- dash_daily_metrics — per-day (UTC) attempt counts and outcome counts, bucketed on
-- recorded_at (behavioural series). With-audio count included for capture trend.
-- =============================================================================
create or replace view public.dash_daily_metrics
with (security_invoker = true) as
select
  (cpa.recorded_at at time zone 'UTC')::date as day,
  count(*) as total,
  count(*) filter (where cpa.is_correct is true)  as pass,
  count(*) filter (where cpa.is_correct is false) as fail,
  count(*) filter (where cpa.is_correct is null)  as error,
  count(*) filter (where cpa.audio_storage_path is not null) as with_audio
from public.child_pronunciation_attempt cpa
group by (cpa.recorded_at at time zone 'UTC')::date;

comment on view public.dash_daily_metrics is
  'Read-only per-day (UTC, recorded_at) counts: total, pass/fail/error, with_audio. Additive; never written to.';

-- =============================================================================
-- dash_target_metrics — per (attempt_type, target_sent_to_api) counts and outcome
-- rates. Letters and words stay separated by attempt_type (never pooled).
-- pass_rate uses scored-only denominator; fail_error_rate uses all attempts.
-- =============================================================================
create or replace view public.dash_target_metrics
with (security_invoker = true) as
select
  cpa.attempt_type,
  cpa.target_sent_to_api as target,
  count(*) as total,
  count(*) filter (where cpa.is_correct is true)  as pass,
  count(*) filter (where cpa.is_correct is false) as fail,
  count(*) filter (where cpa.is_correct is null)  as error,
  count(*) filter (where cpa.audio_storage_path is not null) as with_audio,
  (count(*) filter (where cpa.is_correct is true))::numeric
    / nullif(count(*) filter (where cpa.is_correct is not null), 0) as pass_rate,
  (count(*) filter (where cpa.is_correct is false)
     + count(*) filter (where cpa.is_correct is null))::numeric
    / nullif(count(*), 0) as fail_error_rate
from public.child_pronunciation_attempt cpa
group by cpa.attempt_type, cpa.target_sent_to_api;

comment on view public.dash_target_metrics is
  'Read-only per (attempt_type, target_sent_to_api) counts and outcome rates (pass_rate scored-only; fail_error_rate over all). Additive; never written to.';
