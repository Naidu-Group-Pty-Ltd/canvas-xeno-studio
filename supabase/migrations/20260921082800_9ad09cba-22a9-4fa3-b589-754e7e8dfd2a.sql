CREATE OR REPLACE FUNCTION public.prevent_budget_change_by_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.budget_usd IS NOT NULL OR COALESCE(NEW.budget_mode, 'none') <> 'none' THEN
      RAISE EXCEPTION 'Only administrators can set spending limits';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.budget_usd IS DISTINCT FROM OLD.budget_usd
     OR NEW.budget_mode IS DISTINCT FROM OLD.budget_mode THEN
    RAISE EXCEPTION 'Only administrators can change spending limits';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_budget_change_by_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_project_budget_change ON public.projects;
CREATE TRIGGER prevent_project_budget_change
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.prevent_budget_change_by_member();

DROP TRIGGER IF EXISTS prevent_campaign_budget_change ON public.campaigns;
CREATE TRIGGER prevent_campaign_budget_change
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.prevent_budget_change_by_member();