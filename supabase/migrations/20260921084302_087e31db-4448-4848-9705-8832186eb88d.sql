CREATE TABLE public.media_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  result_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  storage_bucket text,
  storage_path text,
  error_code text,
  error_message text,
  dedupe_key text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX media_tasks_dedupe_key_idx ON public.media_tasks (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX media_tasks_status_idx ON public.media_tasks (status, created_at DESC);
CREATE INDEX media_tasks_source_idx ON public.media_tasks (source_asset_id);

GRANT SELECT ON public.media_tasks TO authenticated;
GRANT ALL ON public.media_tasks TO service_role;

ALTER TABLE public.media_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active members read media tasks"
  ON public.media_tasks FOR SELECT TO authenticated
  USING (public.is_active_member());

CREATE TRIGGER media_tasks_set_updated_at
  BEFORE UPDATE ON public.media_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('media_worker_last_success_at', 'null'::jsonb), ('media_worker_last_error', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;