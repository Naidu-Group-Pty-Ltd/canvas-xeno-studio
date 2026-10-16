-- ============ CREATIVE STUDIO: THE API BALANCE IN THE TOP BAR; KATANA'S TICK ON THE PUBLISHED SITE (additive, re-runnable) ============

-- ---------- What the studio has spent of the Higgsfield API balance ----------
-- Higgsfield's API has no balance endpoint: the balance is shown only in the
-- Higgsfield Console. An admin records the Console's figure in app_settings
-- (higgsfield_api_balance), and the studio shows it less what it has spent
-- since, from its own records. Higgsfield holds a request's price when it
-- accepts it and keeps it only if the request succeeds: failed, moderated and
-- canceled requests are refunded.
--
-- Since `p_since`: the generations Higgsfield accepted (by when they were
-- submitted) that completed, at the charge Higgsfield reported or else the
-- estimate taken at submission; those still in flight, whose price is held;
-- those whose submission's outcome is unknown (each may or may not have been
-- charged); and the Soul ID trainings sent, which Higgsfield doesn't quote a
-- price for. Then, whenever they were, the last time Higgsfield accepted a
-- request and the last time it refused one for want of credits, so the studio
-- can warn that the balance has run out. Called by the server only.
CREATE OR REPLACE FUNCTION public.higgsfield_api_spend_since(p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  with sent as (
    select
      g.status::text as status,
      coalesce(l.actual_cost_usd, g.actual_cost_usd, l.estimated_cost_usd, g.estimated_cost_usd) as usd
    from public.generations g
    left join public.usage_ledger l on l.generation_id = g.id
    where g.submitted_at >= p_since
      or (g.status = 'submission_uncertain' and g.submitted_at is null
          and coalesce(g.submission_started_at, g.created_at) >= p_since)
  ),
  totals as (
    select
      coalesce(sum(usd) filter (where status = 'completed'), 0) as spent_usd,
      count(*) filter (where status = 'completed') as completed,
      coalesce(sum(usd) filter (where status in ('queued', 'in_progress')), 0) as in_flight_usd,
      count(*) filter (where status in ('queued', 'in_progress')) as in_flight,
      coalesce(sum(usd) filter (where status = 'submission_uncertain'), 0) as uncertain_usd,
      count(*) filter (where status = 'submission_uncertain') as uncertain,
      count(*) filter (where status in ('completed', 'queued', 'in_progress') and usd is null) as unpriced
    from sent
  ),
  refusals as (
    select g.updated_at as at, g.error_message as message, 'generation' as kind
    from public.generations g
    where g.status = 'failed'
      and (g.error_code = 'INSUFFICIENT_PROVIDER_BALANCE'
        or g.error_message ilike any (array['%credit balance%', '%not enough credits%', '%not_enough_credits%', '%insufficient credit%', '%insufficient balance%']))
    union all
    select t.updated_at, t.error, 'soul_id_training'
    from public.soul_id_trainings t
    where t.status = 'failed'
      and t.error ilike any (array['%credit balance%', '%not enough credits%', '%not_enough_credits%', '%insufficient credit%', '%insufficient balance%'])
  ),
  last_refusal as (
    select at, message, kind from refusals order by at desc limit 1
  ),
  accepted as (
    select max(g.submitted_at) as at
    from public.generations g
    where g.status in ('queued', 'in_progress', 'completed')
    union all
    select max(t.sent_at)
    from public.soul_id_trainings t
    where t.status in ('training', 'ready')
  )
  select jsonb_build_object(
    'spent_usd', round(totals.spent_usd::numeric, 4),
    'completed', totals.completed,
    'in_flight_usd', round(totals.in_flight_usd::numeric, 4),
    'in_flight', totals.in_flight,
    'uncertain_usd', round(totals.uncertain_usd::numeric, 4),
    'uncertain', totals.uncertain,
    'unpriced', totals.unpriced,
    'trainings', (
      select count(*) from public.soul_id_trainings t
      where t.sent_at >= p_since and t.status in ('training', 'ready', 'uncertain')
    ),
    'last_accepted_at', (select max(at) from accepted),
    'last_refusal', (
      select jsonb_build_object('at', at, 'message', left(coalesce(message, ''), 300), 'kind', kind)
      from last_refusal
    )
  )
  from totals;
$function$;
REVOKE ALL ON FUNCTION public.higgsfield_api_spend_since(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.higgsfield_api_spend_since(timestamptz) TO service_role;

-- ---------- Katana's tick calls the published site ----------
-- The published site holds the Anthropic key Katana's runs use; the -dev
-- preview 0015 pointed at doesn't, so runs it ticked failed for a missing key.
CREATE OR REPLACE FUNCTION app_private.call_katana_tick()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  -- The published site: it holds the Anthropic key Katana runs on (the -dev preview doesn't).
  v_base text := 'https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e.lovable.app';
  v_headers jsonb;
begin
  if not exists (
    select 1 from public.katana_runs
    where status in ('preparing', 'starting', 'running', 'waiting', 'uncertain') or cancel_requested
  ) and not exists (
    select 1 from public.katana_results
    where attempts < 5
      and (status in ('pending', 'failed') or (status = 'saving' and claimed_until < now()))
  ) then
    return null;
  end if;
  select value into v_secret from app_private.cron_secrets where name = 'LOVABLE_CRON_SECRET';
  if v_secret is null or v_secret = '' then raise exception 'cron secret missing'; end if;
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret);
  return net.http_post(url := v_base || '/api/public/katana-tick', headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 65000);
end;
$function$;
REVOKE ALL ON FUNCTION app_private.call_katana_tick() FROM PUBLIC, anon, authenticated;
