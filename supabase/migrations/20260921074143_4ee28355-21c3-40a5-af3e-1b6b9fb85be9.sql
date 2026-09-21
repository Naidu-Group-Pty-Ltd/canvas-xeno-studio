ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS budget_usd numeric,
  ADD COLUMN IF NOT EXISTS budget_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS budget_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS generations_campaign_id_idx ON public.generations(campaign_id);

-- Atomic budget check. Locks the owning row so concurrent submissions serialise
-- and a hard limit can never be exceeded by a race.
CREATE OR REPLACE FUNCTION public.check_spend_allowance(
  _project_id uuid,
  _campaign_id uuid,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_budget numeric; p_mode text; p_spent numeric;
  c_budget numeric; c_mode text; c_spent numeric;
  warn text := NULL;
BEGIN
  IF _project_id IS NOT NULL THEN
    SELECT budget_usd, budget_mode INTO p_budget, p_mode
    FROM public.projects WHERE id = _project_id FOR UPDATE;
    IF p_budget IS NOT NULL AND p_mode <> 'none' THEN
      SELECT COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) INTO p_spent
      FROM public.generations
      WHERE project_id = _project_id AND status NOT IN ('failed','canceled','draft');
      IF p_spent + _amount > p_budget THEN
        IF p_mode = 'hard' THEN
          RETURN jsonb_build_object('allowed', false, 'scope', 'project',
            'message', 'This project has reached its hard spending limit.');
        END IF;
        warn := 'This generation takes the project over its spending limit.';
      END IF;
    END IF;
  END IF;

  IF _campaign_id IS NOT NULL THEN
    SELECT budget_usd, budget_mode INTO c_budget, c_mode
    FROM public.campaigns WHERE id = _campaign_id FOR UPDATE;
    IF c_budget IS NOT NULL AND c_mode <> 'none' THEN
      SELECT COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) INTO c_spent
      FROM public.generations
      WHERE campaign_id = _campaign_id AND status NOT IN ('failed','canceled','draft');
      IF c_spent + _amount > c_budget THEN
        IF c_mode = 'hard' THEN
          RETURN jsonb_build_object('allowed', false, 'scope', 'campaign',
            'message', 'This campaign has reached its hard spending limit.');
        END IF;
        warn := COALESCE(warn, 'This generation takes the campaign over its spending limit.');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'warning', warn);
END; $$;

REVOKE EXECUTE ON FUNCTION public.check_spend_allowance(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;