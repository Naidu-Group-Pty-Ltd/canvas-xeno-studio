
CREATE TYPE public.app_role AS ENUM ('admin','member');
CREATE TYPE public.generation_status AS ENUM ('draft','estimating','ready','local_queued','submitting','submission_uncertain','queued','in_progress','completed','failed','nsfw','canceled');
CREATE TYPE public.ingest_status AS ENUM ('not_required','pending','processing','completed','failed');
CREATE TYPE public.asset_type AS ENUM ('image','video','audio');
CREATE TYPE public.source_type AS ENUM ('generated','uploaded');
CREATE TYPE public.input_role AS ENUM ('image','video','audio','first_frame','last_frame','reference','source');
CREATE TYPE public.operation_type AS ENUM ('text-to-image','image-to-image','text-to-video','image-to-video','reference-to-video','video-to-video','video-extend');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role public.app_role NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active);
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active AND p.role = 'admin');
$$;

CREATE POLICY "members read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_active_member());
CREATE POLICY "admin update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO first_user;
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'member'::public.app_role END, true)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read projects" ON public.projects FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update projects" ON public.projects FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "admins delete projects" ON public.projects FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.asset_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_folders TO authenticated;
GRANT ALL ON public.asset_folders TO service_role;
ALTER TABLE public.asset_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read folders" ON public.asset_folders FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write folders" ON public.asset_folders FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update folders" ON public.asset_folders FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members delete folders" ON public.asset_folders FOR DELETE TO authenticated USING (public.is_active_member());
CREATE TRIGGER folders_updated BEFORE UPDATE ON public.asset_folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.model_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'higgsfield',
  family text NOT NULL,
  display_name text NOT NULL,
  description text,
  model_path text NOT NULL,
  output_type public.asset_type NOT NULL,
  operation public.operation_type NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameter_schema jsonb NOT NULL DEFAULT '{"fields":[]}'::jsonb,
  ui_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_for text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model_path, operation)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_registry TO authenticated;
GRANT ALL ON public.model_registry TO service_role;
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read models" ON public.model_registry FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "admins insert models" ON public.model_registry FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins update models" ON public.model_registry FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admins delete models" ON public.model_registry FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER models_updated BEFORE UPDATE ON public.model_registry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  model_registry_id uuid NOT NULL REFERENCES public.model_registry(id),
  parent_generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  generation_group_id uuid,
  provider text NOT NULL DEFAULT 'higgsfield',
  model_path text NOT NULL,
  operation public.operation_type NOT NULL,
  prompt text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_usd numeric(10,4),
  actual_cost_usd numeric(10,4),
  cost_source text,
  status public.generation_status NOT NULL DEFAULT 'draft',
  hf_request_id text,
  hf_status_url text,
  hf_cancel_url text,
  provider_response jsonb,
  error_code text,
  error_message text,
  submission_started_at timestamptz,
  submitted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_polled_at timestamptz,
  poll_attempts integer NOT NULL DEFAULT 0,
  ingest_status public.ingest_status NOT NULL DEFAULT 'not_required',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generations_status_idx ON public.generations(status);
CREATE INDEX generations_created_idx ON public.generations(created_at DESC);
CREATE INDEX generations_request_idx ON public.generations(hf_request_id);
GRANT SELECT, INSERT, UPDATE ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read generations" ON public.generations FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create generations" ON public.generations FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND user_id = auth.uid());
CREATE POLICY "members update generations" ON public.generations FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE TRIGGER generations_updated BEFORE UPDATE ON public.generations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.asset_folders(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id),
  asset_type public.asset_type NOT NULL,
  source_type public.source_type NOT NULL,
  title text,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  width integer,
  height integer,
  duration_seconds numeric(10,2),
  file_size bigint,
  is_favorite boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (storage_bucket, storage_path)
);
CREATE INDEX assets_created_idx ON public.assets(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read assets" ON public.assets FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.is_active_member());
CREATE POLICY "members update assets" ON public.assets FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "admins delete assets" ON public.assets FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE public.generation_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  input_type public.input_role NOT NULL,
  position integer NOT NULL DEFAULT 0,
  storage_bucket text,
  storage_path text,
  hf_public_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_inputs TO authenticated;
GRANT ALL ON public.generation_inputs TO service_role;
ALTER TABLE public.generation_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read inputs" ON public.generation_inputs FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write inputs" ON public.generation_inputs FOR INSERT TO authenticated WITH CHECK (public.is_active_member());
CREATE POLICY "members update inputs" ON public.generation_inputs FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());

CREATE TABLE public.generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_events_gen_idx ON public.generation_events(generation_id, created_at);
GRANT SELECT ON public.generation_events TO authenticated;
GRANT ALL ON public.generation_events TO service_role;
ALTER TABLE public.generation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read events" ON public.generation_events FOR SELECT TO authenticated USING (public.is_active_member());

CREATE TABLE public.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  model_registry_id uuid NOT NULL REFERENCES public.model_registry(id),
  estimated_cost_usd numeric(10,4),
  actual_cost_usd numeric(10,4),
  billing_status text NOT NULL DEFAULT 'estimated',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation_id)
);
GRANT SELECT ON public.usage_ledger TO authenticated;
GRANT ALL ON public.usage_ledger TO service_role;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read usage" ON public.usage_ledger FOR SELECT TO authenticated USING (public.is_active_member());

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "admins write settings" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (key, value) VALUES
  ('app_name','"Xeno Studio"'::jsonb),
  ('default_image_model','null'::jsonb),
  ('default_video_model','null'::jsonb),
  ('max_provider_concurrency','15'::jsonb),
  ('require_cost_estimate','true'::jsonb),
  ('high_cost_warning_usd','2.00'::jsonb),
  ('provider_enabled','true'::jsonb),
  ('asset_retention_mode','"retain_forever"'::jsonb),
  ('provider_dashboard_url','"https://higgsfield.ai"'::jsonb),
  ('provider_last_success_at','null'::jsonb),
  ('provider_last_error','null'::jsonb);

CREATE POLICY "members read input objects" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generation-inputs' AND public.is_active_member());
CREATE POLICY "members upload input objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generation-inputs' AND public.is_active_member());
CREATE POLICY "members read output objects" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-assets' AND public.is_active_member());

ALTER TABLE public.generations REPLICA IDENTITY FULL;
ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
