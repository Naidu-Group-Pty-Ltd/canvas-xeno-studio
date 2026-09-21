CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- auth.uid() is NULL for trusted server-side callers (service role, triggers).
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Only administrators can change role or active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;