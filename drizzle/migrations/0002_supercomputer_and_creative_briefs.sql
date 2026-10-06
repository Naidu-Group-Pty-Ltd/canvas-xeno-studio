
-- ============ CREATIVE STUDIO: SUPERCOMPUTER + CREATIVE BRIEFS (additive, re-runnable) ============
-- Briefs are imported marketing documents (PDF, Word, PowerPoint, text). Their text and
-- structured analysis live here; their images become ordinary library assets linked
-- through creative_brief_assets, so they can be used as references anywhere.

CREATE TABLE IF NOT EXISTS public.creative_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  source_filename text,
  source_mime text,
  source_bucket text,
  source_path text,
  source_size bigint,
  page_count integer,
  extracted_text text NOT NULL DEFAULT '',
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','analysing','ready','failed')),
  error_message text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_briefs_created_idx ON public.creative_briefs (created_at DESC);
CREATE INDEX IF NOT EXISTS creative_briefs_project_idx ON public.creative_briefs (project_id);

CREATE TABLE IF NOT EXISTS public.creative_brief_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'embedded' CHECK (source IN ('embedded','page','attached')),
  caption text,
  page_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brief_id, asset_id)
);
CREATE INDEX IF NOT EXISTS creative_brief_assets_brief_idx ON public.creative_brief_assets (brief_id, position);

-- Supercomputer conversations are team-visible, like every other studio record.
-- Messages are written only by the server (after the reasoning call), so a client
-- can never forge an assistant reply or its ready-to-run drafts.
CREATE TABLE IF NOT EXISTS public.supercomputer_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'New chat' CHECK (char_length(title) BETWEEN 1 AND 200),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  brief_id uuid REFERENCES public.creative_briefs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercomputer_threads_recent_idx ON public.supercomputer_threads (last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.supercomputer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.supercomputer_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','failed')),
  error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercomputer_messages_thread_idx ON public.supercomputer_messages (thread_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_briefs, public.creative_brief_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supercomputer_threads TO authenticated;
GRANT SELECT ON public.supercomputer_messages TO authenticated;
GRANT ALL ON public.creative_briefs, public.creative_brief_assets, public.supercomputer_threads, public.supercomputer_messages TO service_role;

ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_brief_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supercomputer_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supercomputer_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read briefs" ON public.creative_briefs;
DROP POLICY IF EXISTS "members create briefs" ON public.creative_briefs;
DROP POLICY IF EXISTS "members update briefs" ON public.creative_briefs;
DROP POLICY IF EXISTS "owner or admin delete briefs" ON public.creative_briefs;
CREATE POLICY "members read briefs" ON public.creative_briefs FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members create briefs" ON public.creative_briefs FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update briefs" ON public.creative_briefs FOR UPDATE TO authenticated
  USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "owner or admin delete briefs" ON public.creative_briefs FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "members all brief assets" ON public.creative_brief_assets;
CREATE POLICY "members all brief assets" ON public.creative_brief_assets FOR ALL TO authenticated
  USING (public.is_active_member()) WITH CHECK (public.is_active_member());

DROP POLICY IF EXISTS "members read threads" ON public.supercomputer_threads;
DROP POLICY IF EXISTS "members create threads" ON public.supercomputer_threads;
DROP POLICY IF EXISTS "owner or admin update threads" ON public.supercomputer_threads;
DROP POLICY IF EXISTS "owner or admin delete threads" ON public.supercomputer_threads;
CREATE POLICY "members read threads" ON public.supercomputer_threads FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members create threads" ON public.supercomputer_threads FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "owner or admin update threads" ON public.supercomputer_threads FOR UPDATE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()))
  WITH CHECK (public.is_active_member());
CREATE POLICY "owner or admin delete threads" ON public.supercomputer_threads FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "members read messages" ON public.supercomputer_messages;
CREATE POLICY "members read messages" ON public.supercomputer_messages FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP TRIGGER IF EXISTS creative_briefs_updated ON public.creative_briefs;
CREATE TRIGGER creative_briefs_updated BEFORE UPDATE ON public.creative_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS supercomputer_threads_updated ON public.supercomputer_threads;
CREATE TRIGGER supercomputer_threads_updated BEFORE UPDATE ON public.supercomputer_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Live updates for briefs being analysed and for messages other teammates add.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'supercomputer_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.supercomputer_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'creative_briefs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_briefs;
  END IF;
END $$;

-- Reasoning settings. "auto" uses OPENAI_API_KEY when present, otherwise the
-- project's built-in Lovable AI key. Model values are admin-editable in Settings.
INSERT INTO public.app_settings (key, value) VALUES
  ('reasoning_provider', '"auto"'::jsonb),
  ('supercomputer_model', '"gpt-5.6-sol"'::jsonb),
  ('lovable_ai_model', '"google/gemini-3-flash-preview"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('v2_supercomputer', 'Supercomputer', 'Creative AI agent: brainstorming, brief import and ready-to-run drafts', true)
ON CONFLICT (key) DO NOTHING;
