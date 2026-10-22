-- ============ CREATIVE STUDIO: A PRICE FOR EVERY GENERATION, AND SPEND BY PROJECT (additive, re-runnable) ============
-- A run's cost is the charge the provider reports with its result
-- (cost_source 'provider'). When its result carries none, the run's estimate
-- stands as its cost, marked as estimated by where it came from:
--   'provider_estimate' the provider's quote for the request;
--   'metered_estimate'  the price its metered rate (per 1,000 video tokens) comes to;
--   'unit_estimate'     the price per image, per request or per second its
--                       pricing description states (credits at 16 to the dollar);
--   'list_price'        for a description the studio doesn't follow, the list
--                       price an admin set for the model (below).
-- A price is never made up: a run with none of these stays unpriced, and the
-- Usage page lists its model for an admin to price.
--
-- model_list_prices: an admin's list price for a model, per output image, per
-- request or per second of output, with who set it and when. Members read it;
-- only the server writes it (an admin, from the Usage page).
--
-- generation_spend_by_scope: what generations cost by project and campaign:
-- confirmed (the provider reported the charge), estimated (an estimate stands
-- as the cost), held for runs Higgsfield is running, and how many completed
-- runs are unpriced and how many submissions are uncertain (each may or may
-- not have been charged). unpriced_generation_models: the models whose
-- completed runs have no price at all. Both run as the caller, so what a
-- member may read decides what they count.
--
-- The app works before this is applied: no list prices are offered or used,
-- and spend by project says it needs this update.

CREATE TABLE IF NOT EXISTS public.model_list_prices (
  model_registry_id uuid PRIMARY KEY REFERENCES public.model_registry(id) ON DELETE CASCADE,
  -- What one price is for: each output image, each request, or each second of output.
  unit text NOT NULL CHECK (unit IN ('image', 'request', 'second')),
  usd numeric(10,4) NOT NULL CHECK (usd > 0 AND usd <= 1000),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.model_list_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.model_list_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_list_prices TO service_role;
ALTER TABLE public.model_list_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read model list prices" ON public.model_list_prices;
CREATE POLICY "members read model list prices" ON public.model_list_prices FOR SELECT TO authenticated
  USING (public.is_active_member());

-- Spend by project and campaign since `p_since` (all of it when null), for one
-- project or campaign when given. Refunded work (failed, moderated, canceled)
-- and work never sent cost nothing and isn't counted.
CREATE OR REPLACE FUNCTION public.generation_spend_by_scope(
  p_since timestamptz DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE (
  project_id uuid,
  campaign_id uuid,
  runs bigint,
  confirmed_usd numeric,
  estimated_usd numeric,
  in_flight_usd numeric,
  unpriced bigint,
  uncertain bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  select
    g.project_id,
    g.campaign_id,
    count(*) filter (where g.status = 'completed') as runs,
    round(coalesce(sum(g.actual_cost_usd) filter (where g.status = 'completed'), 0)::numeric, 4)
      as confirmed_usd,
    round(coalesce(sum(g.estimated_cost_usd)
      filter (where g.status = 'completed' and g.actual_cost_usd is null), 0)::numeric, 4)
      as estimated_usd,
    round(coalesce(sum(coalesce(g.actual_cost_usd, g.estimated_cost_usd))
      filter (where g.status in ('queued', 'in_progress')), 0)::numeric, 4)
      as in_flight_usd,
    count(*) filter (where g.status = 'completed'
      and g.actual_cost_usd is null and g.estimated_cost_usd is null) as unpriced,
    count(*) filter (where g.status = 'submission_uncertain') as uncertain
  from public.generations as g
  where (p_since is null or g.created_at >= p_since)
    and (p_project_id is null or g.project_id = p_project_id)
    and (p_campaign_id is null or g.campaign_id = p_campaign_id)
    and g.status in ('completed', 'queued', 'in_progress', 'submission_uncertain')
  group by g.project_id, g.campaign_id;
$function$;
REVOKE ALL ON FUNCTION public.generation_spend_by_scope(timestamptz, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generation_spend_by_scope(timestamptz, uuid, uuid)
  TO authenticated, service_role;

-- The models whose completed runs (since `p_since`, or ever) have no price:
-- neither a charge the provider reported nor any estimate. Most first.
CREATE OR REPLACE FUNCTION public.unpriced_generation_models(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (model_registry_id uuid, runs bigint, last_run_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  select g.model_registry_id, count(*) as runs, max(coalesce(g.completed_at, g.created_at)) as last_run_at
  from public.generations as g
  where g.status = 'completed'
    and g.actual_cost_usd is null
    and g.estimated_cost_usd is null
    and (p_since is null or g.created_at >= p_since)
  group by g.model_registry_id
  order by count(*) desc;
$function$;
REVOKE ALL ON FUNCTION public.unpriced_generation_models(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpriced_generation_models(timestamptz) TO authenticated, service_role;
