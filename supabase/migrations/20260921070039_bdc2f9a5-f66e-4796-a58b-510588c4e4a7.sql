-- ============ V2 foundation (additive) ============

-- Model registry V2 fields
ALTER TABLE public.model_registry
  ADD COLUMN IF NOT EXISTS provider_family text,
  ADD COLUMN IF NOT EXISTS model_family text,
  ADD COLUMN IF NOT EXISTS capability_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS transport_strategy text NOT NULL DEFAULT 'existing_v1_transport',
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'key_secret',
  ADD COLUMN IF NOT EXISTS documentation_status text NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS max_reference_images integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_reference_videos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_reference_audio integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supports_text boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_image_input boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_video_input boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_audio_input boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_first_frame boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_last_frame boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_native_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_seed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_cancel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_extend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_batch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'provider_estimate',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS benchmark_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS router_enabled boolean NOT NULL DEFAULT true;

UPDATE public.model_registry SET provider_family = COALESCE(provider_family, provider), model_family = COALESCE(model_family, family);

-- ============ Feature flags ============
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read flags" ON public.feature_flags FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "admins write flags" ON public.feature_flags FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER feature_flags_updated BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT UPDATE, INSERT, DELETE ON public.feature_flags TO authenticated;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
 ('v2_director','Director','AI creative direction and production planning', true),
 ('v2_storyboards','Storyboards','Scenes, shots and takes', true),
 ('v2_edit_lab','Edit Lab','Video edit, extend, motion transfer, object swap', true),
 ('v2_canvas','Canvas','Node workflow canvas', true),
 ('v2_campaigns','Campaigns','Campaign factory and budgets', true),
 ('v2_model_arena','Model Arena','Side-by-side model comparison', true),
 ('v2_smart_router','Smart Router','Evidence-based model routing', true),
 ('v2_intelligent_library','Intelligent Library','Asset analysis and tagging', true),
 ('v2_quality_control','Quality Control','AI QC review', true),
 ('v2_production_timeline','Production Timeline','Scheduling and assembly view', true),
 ('v2_media_worker','Media Worker','External media processing worker', false),
 ('v2_semantic_search','Semantic Search','Embedding-based library search', false),
 ('v2_command_palette','Command Palette','Global keyboard command palette', true)
ON CONFLICT (key) DO NOTHING;

-- ============ Campaigns ============
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  objective text,
  status text NOT NULL DEFAULT 'draft',
  budget_usd numeric,
  created_by uuid NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read campaigns" ON public.campaigns FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "admins delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Storyboards / scenes / shots / takes ============
CREATE TABLE IF NOT EXISTS public.storyboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL,
  objective text,
  creative_direction jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_duration_seconds integer,
  primary_aspect_ratio text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyboard_id uuid NOT NULL REFERENCES public.storyboards(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  name text NOT NULL,
  purpose text,
  environment text,
  continuity_requirements text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storyboard_id, scene_number)
);
CREATE TABLE IF NOT EXISTS public.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_number integer NOT NULL,
  name text,
  description text,
  prompt text,
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_seconds numeric,
  operation_type text,
  recommended_model_id uuid REFERENCES public.model_registry(id),
  selected_take_id uuid,
  estimated_cost_usd numeric,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, shot_number)
);
CREATE TABLE IF NOT EXISTS public.shot_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id uuid NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  take_number integer NOT NULL,
  is_selected boolean NOT NULL DEFAULT false,
  rating integer,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shot_id, take_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyboards, public.scenes, public.shots, public.shot_takes TO authenticated;
GRANT ALL ON public.storyboards, public.scenes, public.shots, public.shot_takes TO service_role;
ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members all storyboards" ON public.storyboards FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all scenes" ON public.scenes FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all shots" ON public.shots FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all takes" ON public.shot_takes FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE TRIGGER storyboards_updated BEFORE UPDATE ON public.storyboards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER scenes_updated BEFORE UPDATE ON public.scenes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shots_updated BEFORE UPDATE ON public.shots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Continuity packs ============
CREATE TABLE IF NOT EXISTS public.continuity_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  pack_type text NOT NULL DEFAULT 'character',
  name text NOT NULL,
  description text,
  guidance text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.continuity_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.continuity_packs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'reference',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.continuity_packs, public.continuity_pack_items TO authenticated;
GRANT ALL ON public.continuity_packs, public.continuity_pack_items TO service_role;
ALTER TABLE public.continuity_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_pack_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members all packs" ON public.continuity_packs FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all pack items" ON public.continuity_pack_items FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE TRIGGER packs_updated BEFORE UPDATE ON public.continuity_packs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Operations ============
CREATE TABLE IF NOT EXISTS public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  storyboard_id uuid REFERENCES public.storyboards(id) ON DELETE SET NULL,
  scene_id uuid REFERENCES public.scenes(id) ON DELETE SET NULL,
  shot_id uuid REFERENCES public.shots(id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  provider text,
  model_registry_id uuid REFERENCES public.model_registry(id),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  workflow_run_id uuid,
  workflow_node_id text,
  parent_operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  root_operation_id uuid,
  generation_group_id uuid,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'draft',
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  estimated_cost_usd numeric,
  actual_cost_usd numeric,
  provider_request_id text,
  provider_status_url text,
  provider_cancel_url text,
  dedupe_key text,
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  queued_at timestamptz,
  dispatch_started_at timestamptz,
  submitted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_status_idx ON public.operations (status, priority, created_at);
CREATE INDEX IF NOT EXISTS operations_project_idx ON public.operations (project_id);
CREATE INDEX IF NOT EXISTS operations_generation_idx ON public.operations (generation_id);
CREATE UNIQUE INDEX IF NOT EXISTS operations_dedupe_key_idx ON public.operations (dedupe_key) WHERE dedupe_key IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.operations TO authenticated;
GRANT ALL ON public.operations TO service_role;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read operations" ON public.operations FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create operations" ON public.operations FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE TRIGGER operations_updated BEFORE UPDATE ON public.operations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.operation_dependencies (
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  depends_on_operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  dependency_mode text NOT NULL DEFAULT 'required',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, depends_on_operation_id),
  CHECK (operation_id <> depends_on_operation_id)
);
GRANT SELECT ON public.operation_dependencies TO authenticated;
GRANT ALL ON public.operation_dependencies TO service_role;
ALTER TABLE public.operation_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read op deps" ON public.operation_dependencies FOR SELECT TO authenticated USING (public.is_active_member());

CREATE TABLE IF NOT EXISTS public.operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_events_op_idx ON public.operation_events (operation_id, created_at);
GRANT SELECT ON public.operation_events TO authenticated;
GRANT ALL ON public.operation_events TO service_role;
ALTER TABLE public.operation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read op events" ON public.operation_events FOR SELECT TO authenticated USING (public.is_active_member());

-- Durable claim function (service role only)
CREATE OR REPLACE FUNCTION public.claim_ready_operations(claim_limit integer DEFAULT 5)
RETURNS SETOF public.operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.operations o
    WHERE o.status IN ('ready','local_queued')
      AND NOT EXISTS (
        SELECT 1 FROM public.operation_dependencies d
        JOIN public.operations dep ON dep.id = d.depends_on_operation_id
        WHERE d.operation_id = o.id
          AND d.dependency_mode <> 'optional'
          AND dep.status <> 'completed'
      )
    ORDER BY o.priority ASC, o.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  )
  UPDATE public.operations o
  SET status = 'dispatching', dispatch_started_at = now(), attempt = o.attempt + 1
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END; $$;
REVOKE EXECUTE ON FUNCTION public.claim_ready_operations(integer) FROM PUBLIC, anon, authenticated;

-- Circular dependency guard
CREATE OR REPLACE FUNCTION public.prevent_operation_cycles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cycle boolean;
BEGIN
  WITH RECURSIVE chain AS (
    SELECT NEW.operation_id AS op
    UNION ALL
    SELECT d.operation_id FROM public.operation_dependencies d JOIN chain ON d.depends_on_operation_id = chain.op
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE op = NEW.depends_on_operation_id) INTO cycle;
  IF cycle THEN RAISE EXCEPTION 'Circular operation dependency rejected'; END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.prevent_operation_cycles() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS operation_dependencies_no_cycles ON public.operation_dependencies;
CREATE TRIGGER operation_dependencies_no_cycles BEFORE INSERT OR UPDATE ON public.operation_dependencies
FOR EACH ROW EXECUTE FUNCTION public.prevent_operation_cycles();

-- ============ Workflow engine ============
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  created_by uuid,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  node_key text NOT NULL,
  node_type text NOT NULL,
  label text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_template_id, version, node_key)
);
CREATE TABLE IF NOT EXISTS public.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  source_node_key text NOT NULL,
  target_node_key text NOT NULL,
  condition jsonb
);
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  workflow_version integer NOT NULL DEFAULT 1,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_usd numeric,
  actual_cost_usd numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates, public.workflow_nodes, public.workflow_edges TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_templates, public.workflow_nodes, public.workflow_edges, public.workflow_runs TO service_role;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members all wf templates" ON public.workflow_templates FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all wf nodes" ON public.workflow_nodes FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members all wf edges" ON public.workflow_edges FOR ALL TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members read wf runs" ON public.workflow_runs FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create wf runs" ON public.workflow_runs FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE TRIGGER wf_templates_updated BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Model intelligence ============
CREATE TABLE IF NOT EXISTS public.model_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_registry_id uuid NOT NULL REFERENCES public.model_registry(id) ON DELETE CASCADE,
  operation text NOT NULL,
  aspect_ratio text,
  resolution text,
  sample_count integer NOT NULL DEFAULT 0,
  success_rate numeric,
  failure_rate numeric,
  average_latency_seconds numeric,
  average_estimated_cost numeric,
  average_actual_cost numeric,
  average_user_rating numeric,
  selection_rate numeric,
  benchmark_score numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_registry_id, operation, aspect_ratio, resolution)
);
GRANT SELECT ON public.model_performance_metrics TO authenticated;
GRANT ALL ON public.model_performance_metrics TO service_role;
ALTER TABLE public.model_performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read metrics" ON public.model_performance_metrics FOR SELECT TO authenticated USING (public.is_active_member());

CREATE TABLE IF NOT EXISTS public.arena_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  prompt text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_type text NOT NULL DEFAULT 'image',
  blind_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  estimated_cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.arena_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.arena_sessions(id) ON DELETE CASCADE,
  model_registry_id uuid NOT NULL REFERENCES public.model_registry(id),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  estimated_cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, model_registry_id)
);
CREATE TABLE IF NOT EXISTS public.arena_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.arena_sessions(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.arena_entries(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  is_winner boolean NOT NULL DEFAULT false,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, voter_id)
);
GRANT SELECT, INSERT, UPDATE ON public.arena_sessions, public.arena_entries, public.arena_votes TO authenticated;
GRANT ALL ON public.arena_sessions, public.arena_entries, public.arena_votes TO service_role;
ALTER TABLE public.arena_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read arena" ON public.arena_sessions FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create arena" ON public.arena_sessions FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update arena" ON public.arena_sessions FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members read arena entries" ON public.arena_entries FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write arena entries" ON public.arena_entries FOR INSERT TO authenticated WITH CHECK (public.is_active_member());
CREATE POLICY "members update arena entries" ON public.arena_entries FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members read votes" ON public.arena_votes FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members cast votes" ON public.arena_votes FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND voter_id = auth.uid());
CREATE POLICY "members update own votes" ON public.arena_votes FOR UPDATE TO authenticated USING (voter_id = auth.uid()) WITH CHECK (voter_id = auth.uid());

-- ============ Director ============
CREATE TABLE IF NOT EXISTS public.director_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled brief',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.director_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.director_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.production_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.director_sessions(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  storyboard_id uuid REFERENCES public.storyboards(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  plan jsonb NOT NULL,
  total_estimated_cost_usd numeric,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.production_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.production_plans(id) ON DELETE CASCADE,
  version integer NOT NULL,
  plan jsonb NOT NULL,
  change_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.director_sessions, public.director_messages, public.production_plans, public.production_plan_versions TO authenticated;
GRANT ALL ON public.director_sessions, public.director_messages, public.production_plans, public.production_plan_versions TO service_role;
ALTER TABLE public.director_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own director sessions" ON public.director_sessions FOR ALL TO authenticated USING (created_by = auth.uid() AND public.is_active_member()) WITH CHECK (created_by = auth.uid() AND public.is_active_member());
CREATE POLICY "own director messages" ON public.director_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.director_sessions s WHERE s.id = session_id AND s.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.director_sessions s WHERE s.id = session_id AND s.created_by = auth.uid()));
CREATE POLICY "members read plans" ON public.production_plans FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write plans" ON public.production_plans FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update plans" ON public.production_plans FOR UPDATE TO authenticated USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "members read plan versions" ON public.production_plan_versions FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write plan versions" ON public.production_plan_versions FOR INSERT TO authenticated WITH CHECK (public.is_active_member());
CREATE TRIGGER director_sessions_updated BEFORE UPDATE ON public.director_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER production_plans_updated BEFORE UPDATE ON public.production_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ V2 settings defaults ============
INSERT INTO public.app_settings (key, value) VALUES
 ('director_model', '"gpt-6-astra"'::jsonb),
 ('qc_model', '"gpt-5.6-sol"'::jsonb),
 ('router_model', '"gpt-5.6-sol"'::jsonb),
 ('router_weights', '{"human_rating":0.3,"success_rate":0.25,"benchmark":0.2,"latency":0.1,"cost":0.15,"min_samples":5}'::jsonb),
 ('reasoning_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;