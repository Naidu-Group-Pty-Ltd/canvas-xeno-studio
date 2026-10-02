
-- ============ AVATAR STUDIO (separate vertical, avatar_ namespace) ============
CREATE TABLE public.avatar_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.avatar_folders(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.avatar_folders(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('image','video','audio','document')),
  asset_role text NOT NULL DEFAULT 'source_video' CHECK (asset_role IN ('training_video','training_audio','identity_reference','avatar_reference','look_reference','source_video','source_audio','source_image','generated_video','generated_audio','translated_video','lipsynced_video','thumbnail','caption','realtime_artifact')),
  source_type text NOT NULL DEFAULT 'uploaded' CHECK (source_type IN ('uploaded','heygen','liveavatar','generated','imported')),
  sensitivity text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','identity','voice_training','avatar_training')),
  title text,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  provider_asset_id text,
  provider_url text,
  mime_type text,
  file_size bigint,
  width integer, height integer,
  duration_seconds numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (storage_bucket, storage_path)
);
CREATE INDEX avatar_assets_project_idx ON public.avatar_assets(project_id, created_at DESC);
CREATE INDEX avatar_assets_role_idx ON public.avatar_assets(asset_role, created_at DESC);

CREATE TABLE public.avatar_asset_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid NOT NULL REFERENCES public.avatar_assets(id) ON DELETE CASCADE,
  target_asset_id uuid NOT NULL REFERENCES public.avatar_assets(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('trained_from','voice_trained_from','generated_from','translated_from','lipsynced_from','thumbnail_of','avatar_reference','look_reference','creative_bridge_copy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_asset_id, target_asset_id, relationship)
);

CREATE TABLE public.avatar_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'heygen',
  provider_group_id text,
  display_name text NOT NULL,
  avatar_type text NOT NULL DEFAULT 'other' CHECK (avatar_type IN ('digital_twin','photo','prompt','public','studio','other')),
  ownership_type text NOT NULL DEFAULT 'owned' CHECK (ownership_type IN ('owned','provider_public')),
  description text,
  preview_url text,
  preview_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  default_voice_id uuid,
  provider_training_status text,
  provider_consent_status text,
  local_consent_status text NOT NULL DEFAULT 'not_required' CHECK (local_consent_status IN ('not_required','attested','missing')),
  is_active boolean NOT NULL DEFAULT true,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX avatar_characters_provider_group_uq ON public.avatar_characters(provider, provider_group_id) WHERE provider_group_id IS NOT NULL;

CREATE TABLE public.avatar_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.avatar_characters(id) ON DELETE CASCADE,
  provider_look_id text NOT NULL,
  display_name text NOT NULL,
  avatar_type text,
  preview_url text,
  preview_video_url text,
  preview_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  orientation text,
  training_status text,
  supported_engines jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_provider_voice_id text,
  is_default boolean NOT NULL DEFAULT false,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (provider_look_id)
);
CREATE INDEX avatar_looks_character_idx ON public.avatar_looks(character_id);

CREATE TABLE public.avatar_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  character_id uuid REFERENCES public.avatar_characters(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'heygen',
  provider_voice_id text NOT NULL,
  display_name text NOT NULL,
  voice_type text NOT NULL CHECK (voice_type IN ('stock','designed','instant_clone','professional_clone','digital_twin_auto')),
  engine text,
  language text, locale text, gender_metadata text,
  preview_url text,
  supports_pause boolean,
  status text NOT NULL DEFAULT 'ready',
  is_owned boolean NOT NULL DEFAULT false,
  is_default_for_character boolean NOT NULL DEFAULT false,
  provider_slot_status text,
  preview_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (provider, provider_voice_id)
);
ALTER TABLE public.avatar_characters ADD CONSTRAINT avatar_characters_default_voice_fk FOREIGN KEY (default_voice_id) REFERENCES public.avatar_voices(id) ON DELETE SET NULL;

CREATE TABLE public.avatar_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('character','voice','asset')),
  character_id uuid REFERENCES public.avatar_characters(id) ON DELETE SET NULL,
  voice_id uuid REFERENCES public.avatar_voices(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  consent_category text NOT NULL CHECK (consent_category IN ('avatar_training','photo_identity','voice_clone','professional_voice','realtime_identity')),
  provider_required boolean NOT NULL DEFAULT false,
  provider_consent_id text,
  provider_consent_url text,
  provider_consent_expires_at timestamptz,
  provider_status text,
  internal_attestation text,
  attested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attested_at timestamptz,
  permission_description text,
  consent_method text NOT NULL DEFAULT 'internal_attestation',
  workflow text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_voice_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id uuid REFERENCES public.avatar_voices(id) ON DELETE CASCADE,
  training_id uuid,
  asset_id uuid NOT NULL REFERENCES public.avatar_assets(id) ON DELETE CASCADE,
  sample_role text NOT NULL DEFAULT 'training' CHECK (sample_role IN ('training','preview','retraining')),
  duration_seconds numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (job_type IN ('provider_sync','asset_upload','avatar_create_digital_twin','avatar_create_photo','avatar_create_prompt','avatar_create_look','avatar_consent','voice_clone_instant','voice_train_professional','voice_retrain_professional','voice_tts','avatar_video','image_avatar_video','audio_avatar_video','cinematic_avatar_video','transparent_avatar_video','translation','lipsync','batch_video','batch_translation','batch_lipsync','realtime_session','output_ingest')),
  provider text NOT NULL DEFAULT 'heygen',
  provider_resource_type text,
  provider_request_id text,
  provider_batch_id text,
  idempotency_key text,
  client_request_id text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preparing','local_queued','submitting','submission_uncertain','provider_pending','provider_processing','provider_active','awaiting_consent','completed','failed','canceled','blocked','ingesting','ingest_failed')),
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_payload jsonb,
  output_payload jsonb,
  submission_state text NOT NULL DEFAULT 'not_submitted' CHECK (submission_state IN ('not_submitted','submitting','accepted','rejected','uncertain')),
  retry_policy jsonb NOT NULL DEFAULT '{"auto_retry": false}'::jsonb,
  attempt integer NOT NULL DEFAULT 0,
  poll_attempts integer NOT NULL DEFAULT 0,
  parent_job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  error_code text, error_message text,
  queued_at timestamptz, submission_started_at timestamptz, submitted_at timestamptz,
  started_at timestamptz, completed_at timestamptz, failed_at timestamptz, last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX avatar_jobs_idem_uq ON public.avatar_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX avatar_jobs_client_req_uq ON public.avatar_jobs(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX avatar_jobs_status_idx ON public.avatar_jobs(status, updated_at);
CREATE INDEX avatar_jobs_provider_req_idx ON public.avatar_jobs(provider_request_id);
CREATE INDEX avatar_jobs_created_idx ON public.avatar_jobs(created_at DESC);

CREATE TABLE public.avatar_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.avatar_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_job_events_job_idx ON public.avatar_job_events(job_id, created_at);

CREATE TABLE public.avatar_voice_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id uuid REFERENCES public.avatar_voices(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('instant','professional','professional_retrain')),
  provider_training_id text,
  status text NOT NULL DEFAULT 'pending',
  requested_language text,
  voice_name text,
  sample_count integer NOT NULL DEFAULT 0,
  total_duration_seconds numeric,
  idempotency_key text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text, error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.avatar_voice_samples ADD CONSTRAINT avatar_voice_samples_training_fk FOREIGN KEY (training_id) REFERENCES public.avatar_voice_trainings(id) ON DELETE SET NULL;

CREATE TABLE public.avatar_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  character_id uuid REFERENCES public.avatar_characters(id) ON DELETE SET NULL,
  look_id uuid REFERENCES public.avatar_looks(id) ON DELETE SET NULL,
  voice_id uuid REFERENCES public.avatar_voices(id) ON DELETE SET NULL,
  provider_video_id text,
  video_type text NOT NULL,
  engine text,
  script text,
  audio_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  motion_prompt text,
  aspect_ratio text, resolution text, output_format text,
  provider_status text,
  generated_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  thumbnail_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  duration_seconds numeric,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX avatar_videos_provider_uq ON public.avatar_videos(provider_video_id) WHERE provider_video_id IS NOT NULL;

CREATE TABLE public.avatar_localizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.avatar_projects(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('translation','lipsync')),
  source_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  audio_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  provider_resource_id text,
  target_language text,
  mode text,
  status text NOT NULL DEFAULT 'pending',
  output_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  caption_asset_id uuid REFERENCES public.avatar_assets(id) ON DELETE SET NULL,
  error_message text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX avatar_localizations_provider_uq ON public.avatar_localizations(kind, provider_resource_id) WHERE provider_resource_id IS NOT NULL;

CREATE TABLE public.avatar_realtime_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  mode text NOT NULL DEFAULT 'managed' CHECK (mode IN ('managed','custom_gpt_live')),
  liveavatar_avatar_id text,
  liveavatar_voice_id text,
  liveavatar_context_id text,
  language text NOT NULL DEFAULT 'en',
  system_prompt text,
  max_session_seconds integer NOT NULL DEFAULT 600 CHECK (max_session_seconds BETWEEN 30 AND 3600),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_realtime_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid REFERENCES public.avatar_realtime_personas(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'managed',
  is_sandbox boolean NOT NULL DEFAULT false,
  provider_session_id text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','token_issued','connecting','active','stopping','ended','failed','orphaned')),
  started_at timestamptz, last_heartbeat_at timestamptz, ended_at timestamptz,
  duration_seconds integer,
  end_reason text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_realtime_sessions_status_idx ON public.avatar_realtime_sessions(status, last_heartbeat_at);

-- session tokens are credentials: kept in a table with no member access
CREATE TABLE public.avatar_realtime_session_secrets (
  session_id uuid PRIMARY KEY REFERENCES public.avatar_realtime_sessions(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_realtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.avatar_realtime_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_provider_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'heygen',
  provider_event_id text,
  event_type text,
  resource_id text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_result text,
  UNIQUE (provider, payload_hash)
);

CREATE TABLE public.avatar_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.avatar_jobs(id) ON DELETE SET NULL,
  realtime_session_id uuid REFERENCES public.avatar_realtime_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'heygen',
  usage_type text NOT NULL,
  quantity numeric, unit text,
  provider_credits numeric, actual_cost_usd numeric,
  balance_before numeric, balance_after numeric,
  source text NOT NULL CHECK (source IN ('provider_returned','balance_snapshot','internal_metric')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX avatar_usage_job_type_uq ON public.avatar_usage_ledger(job_id, usage_type) WHERE job_id IS NOT NULL;

CREATE TABLE public.avatar_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avatar_creative_bridges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_asset_id uuid NOT NULL REFERENCES public.avatar_assets(id) ON DELETE CASCADE,
  creative_asset_id uuid,
  bridged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avatar_asset_id)
);

CREATE TABLE public.avatar_resource_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.avatar_identity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text, subject_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at triggers
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['avatar_projects','avatar_folders','avatar_characters','avatar_looks','avatar_voices','avatar_consents','avatar_jobs','avatar_realtime_personas','avatar_realtime_sessions'] LOOP
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ============ GRANTS ============
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['avatar_projects','avatar_folders','avatar_assets','avatar_asset_relationships','avatar_characters','avatar_looks','avatar_voices','avatar_consents','avatar_voice_samples','avatar_jobs','avatar_job_events','avatar_voice_trainings','avatar_videos','avatar_localizations','avatar_realtime_personas','avatar_realtime_sessions','avatar_realtime_session_secrets','avatar_realtime_events','avatar_provider_webhook_events','avatar_usage_ledger','avatar_settings','avatar_creative_bridges','avatar_resource_sync','avatar_identity_audit'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- read-only for members (writes only via validated server functions)
  FOREACH t IN ARRAY ARRAY['avatar_asset_relationships','avatar_characters','avatar_looks','avatar_voices','avatar_consents','avatar_voice_samples','avatar_jobs','avatar_job_events','avatar_voice_trainings','avatar_videos','avatar_localizations','avatar_realtime_sessions','avatar_realtime_events','avatar_usage_ledger','avatar_settings','avatar_creative_bridges','avatar_resource_sync'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY "active members read" ON public.%I FOR SELECT TO authenticated USING (public.is_active_member())', t);
  END LOOP;
END $$;

-- collaborative tables
GRANT SELECT, INSERT, UPDATE ON public.avatar_projects TO authenticated;
CREATE POLICY "members read" ON public.avatar_projects FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create" ON public.avatar_projects FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update" ON public.avatar_projects FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_folders TO authenticated;
CREATE POLICY "members read" ON public.avatar_folders FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write" ON public.avatar_folders FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update" ON public.avatar_folders FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members delete" ON public.avatar_folders FOR DELETE TO authenticated USING (public.is_active_member());

-- assets: members read; training/identity media visible only to uploader + admins
GRANT SELECT, UPDATE ON public.avatar_assets TO authenticated;
CREATE POLICY "members read assets" ON public.avatar_assets FOR SELECT TO authenticated
  USING (public.is_active_member() AND (sensitivity = 'normal' OR uploaded_by = auth.uid() OR public.is_admin()));
CREATE POLICY "members organise assets" ON public.avatar_assets FOR UPDATE TO authenticated
  USING (public.is_active_member() AND (sensitivity = 'normal' OR uploaded_by = auth.uid() OR public.is_admin()))
  WITH CHECK (public.is_active_member());

-- prevent members from rewriting storage pointers / sensitivity on assets
CREATE OR REPLACE FUNCTION public.avatar_assets_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    IF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.sensitivity IS DISTINCT FROM OLD.sensitivity OR NEW.asset_role IS DISTINCT FROM OLD.asset_role
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.provider_asset_id IS DISTINCT FROM OLD.provider_asset_id
       OR NEW.source_type IS DISTINCT FROM OLD.source_type THEN
      RAISE EXCEPTION 'Only title, project, folder, metadata and deletion state can be changed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.avatar_assets_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER avatar_assets_guard BEFORE UPDATE ON public.avatar_assets FOR EACH ROW EXECUTE FUNCTION public.avatar_assets_guard();

-- personas: members read; admins manage
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_realtime_personas TO authenticated;
CREATE POLICY "members read" ON public.avatar_realtime_personas FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "admins manage" ON public.avatar_realtime_personas FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- settings: admins write
GRANT INSERT, UPDATE ON public.avatar_settings TO authenticated;
CREATE POLICY "admins write" ON public.avatar_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins update" ON public.avatar_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit: admins read only
GRANT SELECT ON public.avatar_identity_audit TO authenticated;
CREATE POLICY "admins read audit" ON public.avatar_identity_audit FOR SELECT TO authenticated USING (public.is_admin());
-- avatar_provider_webhook_events, avatar_realtime_session_secrets: service role only (no policies)

-- ============ private webhook signing secret (service role only) ============
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.avatar_provider_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.avatar_provider_secrets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.avatar_set_provider_secret(_name text, _value text, _meta jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO app_private.avatar_provider_secrets(name, value, meta, updated_at) VALUES (_name, _value, coalesce(_meta,'{}'::jsonb), now())
  ON CONFLICT (name) DO UPDATE SET value = excluded.value, meta = excluded.meta, updated_at = now();
$$;
CREATE OR REPLACE FUNCTION public.avatar_get_provider_secret(_name text) RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT value FROM app_private.avatar_provider_secrets WHERE name = _name;
$$;
REVOKE EXECUTE ON FUNCTION public.avatar_set_provider_secret(text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.avatar_get_provider_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avatar_set_provider_secret(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.avatar_get_provider_secret(text) TO service_role;

-- ============ seed flags + settings ============
INSERT INTO public.feature_flags(key,label,description,enabled) VALUES
 ('avatar_studio_enabled','Avatar Studio','Identity-first avatar, voice and localization vertical',true),
 ('avatar_digital_twins_enabled','Avatar · Digital Twins','Train lifelike avatars from footage',true),
 ('avatar_photo_avatars_enabled','Avatar · Photo Avatars','Create avatars from a single photo',true),
 ('avatar_prompt_avatars_enabled','Avatar · Prompt Avatars','Generate synthetic characters from text',true),
 ('avatar_voice_clone_enabled','Avatar · Instant Voice Clone','Clone a voice from one recording',true),
 ('avatar_professional_voice_enabled','Avatar · Professional Voice','Train professional voice clones (paid slot)',true),
 ('avatar_realtime_enabled','Avatar · Realtime','LiveAvatar conversational sessions',true),
 ('avatar_localization_enabled','Avatar · Localization','Video translation and lipsync',true),
 ('avatar_batch_enabled','Avatar · Batch','Batch avatar video submission',true),
 ('avatar_creative_bridge_enabled','Avatar · Send to Creative Studio','Explicitly copy finished media into Creative Studio',true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.avatar_settings(key,value) VALUES
 ('default_resolution','"1080p"'),
 ('default_aspect_ratio','"16:9"'),
 ('require_rights_attestation','true'),
 ('training_media_retention','"retain"'),
 ('public_avatar_sync','false'),
 ('webhook_endpoint','null'),
 ('provider_last_success_at','null'),
 ('provider_last_error','null'),
 ('liveavatar_last_success_at','null'),
 ('liveavatar_last_error','null'),
 ('balance_snapshot','null'),
 ('translation_default_mode','"speed"')
ON CONFLICT (key) DO NOTHING;
