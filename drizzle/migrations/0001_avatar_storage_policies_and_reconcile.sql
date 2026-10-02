
CREATE POLICY "avatar training upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatar-training-media' AND public.is_active_member() AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar training read own or admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatar-training-media' AND public.is_active_member() AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY "avatar media upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatar-media' AND public.is_active_member() AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar media read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatar-media' AND public.is_active_member());
CREATE POLICY "avatar generated read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatar-generated' AND public.is_active_member());

-- The existing 5-minute recovery tick now also wakes Avatar Studio's own reconcile route
-- (separate endpoint, separate code); no additional scheduled job.
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
  v_id := net.http_post(url := v_base || '/api/public/higgsfield-reconcile', headers := v_headers, body := '{}'::jsonb);
  perform net.http_post(url := v_base || '/api/public/avatar-reconcile', headers := v_headers, body := '{}'::jsonb);
  return v_id;
end;
$function$;
