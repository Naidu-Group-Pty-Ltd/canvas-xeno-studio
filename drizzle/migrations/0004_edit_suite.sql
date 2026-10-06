-- ============ CREATIVE STUDIO: EDITOR (sequences and renders; additive, re-runnable) ============
-- A sequence is an edit: generated shots, uploads and stills on a timeline with
-- transitions, voiceover, music, captions and titles. Its timeline is one JSON
-- document so an edit saves atomically; `version` guards against two people
-- overwriting each other. Each render keeps a snapshot of the timeline it used
-- and links to the media task and the finished video in the library.

CREATE TABLE IF NOT EXISTS public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled edit' CHECK (char_length(title) BETWEEN 1 AND 200),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  brief_id uuid REFERENCES public.creative_briefs(id) ON DELETE SET NULL,
  storyboard_id uuid REFERENCES public.storyboards(id) ON DELETE SET NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  timeline jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(timeline) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','rendering','rendered','failed')),
  last_render_id uuid,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sequences_recent_idx ON public.sequences (updated_at DESC);
CREATE INDEX IF NOT EXISTS sequences_project_idx ON public.sequences (project_id);

CREATE TABLE IF NOT EXISTS public.sequence_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  sequence_version integer NOT NULL,
  timeline jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','rendering','completed','failed')),
  progress real NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  stage text,
  media_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  duration_seconds numeric,
  error_code text,
  error_message text,
  dedupe_key text UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS sequence_renders_sequence_idx ON public.sequence_renders (sequence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sequence_renders_task_idx ON public.sequence_renders (media_task_id);
-- One render per edit at a time: two people pressing Render together can't start two.
CREATE UNIQUE INDEX IF NOT EXISTS sequence_renders_one_active
  ON public.sequence_renders (sequence_id) WHERE status IN ('queued','rendering');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sequences_last_render_id_fkey') THEN
    ALTER TABLE public.sequences
      ADD CONSTRAINT sequences_last_render_id_fkey FOREIGN KEY (last_render_id)
      REFERENCES public.sequence_renders(id) ON DELETE SET NULL;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequences TO authenticated;
GRANT SELECT ON public.sequence_renders TO authenticated;
GRANT ALL ON public.sequences, public.sequence_renders TO service_role;

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_renders ENABLE ROW LEVEL SECURITY;

-- Edits are shared team work, like storyboards: any active member can open and
-- change one. Renders are written only by the server.
DROP POLICY IF EXISTS "members read sequences" ON public.sequences;
DROP POLICY IF EXISTS "members create sequences" ON public.sequences;
DROP POLICY IF EXISTS "members update sequences" ON public.sequences;
DROP POLICY IF EXISTS "owner or admin delete sequences" ON public.sequences;
CREATE POLICY "members read sequences" ON public.sequences FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY "members create sequences" ON public.sequences FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = auth.uid());
CREATE POLICY "members update sequences" ON public.sequences FOR UPDATE TO authenticated
  USING (public.is_active_member()) WITH CHECK (public.is_active_member());
CREATE POLICY "owner or admin delete sequences" ON public.sequences FOR DELETE TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "members read sequence renders" ON public.sequence_renders;
CREATE POLICY "members read sequence renders" ON public.sequence_renders FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP TRIGGER IF EXISTS sequences_updated ON public.sequences;
CREATE TRIGGER sequences_updated BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS sequence_renders_updated ON public.sequence_renders;
CREATE TRIGGER sequence_renders_updated BEFORE UPDATE ON public.sequence_renders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Closing a render that stopped reporting closes its media task and operation
-- with it, in one statement, so nothing can see (or act on) half of it.
-- Called by the server only.
CREATE OR REPLACE FUNCTION public.close_stalled_renders(p_sequence_id uuid, p_stalled_before timestamptz)
RETURNS integer
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  WITH closed AS (
    UPDATE public.sequence_renders
       SET status = 'failed', error_code = 'STALLED',
           error_message = 'This render stopped responding.', completed_at = now()
     WHERE sequence_id = p_sequence_id
       AND status IN ('queued', 'rendering')
       AND updated_at < p_stalled_before
    RETURNING media_task_id
  ), tasks AS (
    UPDATE public.media_tasks
       SET status = 'failed', error_code = 'STALLED',
           error_message = 'This render stopped responding.', completed_at = now()
     WHERE id IN (SELECT media_task_id FROM closed)
       AND status IN ('submitting', 'processing')
    RETURNING operation_id
  ), operations_closed AS (
    UPDATE public.operations
       SET status = 'failed', error_code = 'STALLED',
           error_message = 'This render stopped responding.', failed_at = now()
     WHERE id IN (SELECT operation_id FROM tasks)
       AND status = 'running'
    RETURNING id
  )
  SELECT count(*)::integer FROM closed;
$$;
REVOKE ALL ON FUNCTION public.close_stalled_renders(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stalled_renders(uuid, timestamptz) TO service_role;

-- Live render progress and teammates' edits.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sequences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sequences;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sequence_renders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sequence_renders;
  END IF;
END $$;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('v2_editor', 'Editor', 'Compile shots into finished videos with transitions, voiceover, music and captions', true)
ON CONFLICT (key) DO NOTHING;
