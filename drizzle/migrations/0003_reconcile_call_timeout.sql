-- The Creative Studio reconcile route now saves completed outputs while this
-- call waits, so it gets two minutes instead of pg_net's 5 s default, which
-- would cut a large save short. Avatar Studio's call is unchanged.
CREATE OR REPLACE FUNCTION app_private.call_higgsfield_reconcile()
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_secret text;
  v_base text := 'https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e-dev.lovable.app';
  v_id bigint;
  v_headers jsonb;
begin
  select value into v_secret from app_private.cron_secrets where name = 'LOVABLE_CRON_SECRET';
  if v_secret is null or v_secret = '' then raise exception 'cron secret missing'; end if;
  v_headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret);
  v_id := net.http_post(url := v_base || '/api/public/higgsfield-reconcile', headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 120000);
  perform net.http_post(url := v_base || '/api/public/avatar-reconcile', headers := v_headers, body := '{}'::jsonb);
  return v_id;
end;
$function$;
