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

-- An edit's owner (who may delete it) is fixed: members can change an edit
-- but not take it over. The server (and database maintenance) still can.
CREATE OR REPLACE FUNCTION public.keep_sequence_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'An edit''s owner can''t be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sequences_keep_owner ON public.sequences;
CREATE TRIGGER sequences_keep_owner BEFORE UPDATE OF created_by ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.keep_sequence_owner();

-- An edit's render state (its status and the render it points at) is written
-- only by the server: a member who could change it could keep a render's
-- outcome from being recorded, or show an edit as rendered when it isn't. A
-- new edit starts as a draft. A save still makes a rendered edit a draft again
-- (sequences_saved_as_draft does that as part of the save).
CREATE OR REPLACE FUNCTION public.keep_sequence_render_state() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' OR NEW.last_render_id IS NOT NULL THEN
      RAISE EXCEPTION 'An edit''s render state is set by the server.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.last_render_id IS DISTINCT FROM OLD.last_render_id THEN
    RAISE EXCEPTION 'An edit''s render state is set by the server.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sequences_keep_render_state ON public.sequences;
CREATE TRIGGER sequences_keep_render_state BEFORE INSERT OR UPDATE OF status, last_render_id ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.keep_sequence_render_state();

-- "Rendered" and "Render failed" describe the version that was rendered: a
-- save after the render ended makes the edit a draft again. (A save during a
-- render leaves it rendering; the render's end then settles it.)
CREATE OR REPLACE FUNCTION public.sequence_saved_as_draft() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version AND OLD.status IN ('rendered', 'failed') THEN
    NEW.status := 'draft';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sequences_saved_as_draft ON public.sequences;
CREATE TRIGGER sequences_saved_as_draft BEFORE UPDATE OF version ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.sequence_saved_as_draft();

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

-- Starting a render records everything it needs in one transaction, so no
-- failure can leave part of it behind. The edit is locked (a save waits) and
-- must still be the version that was checked; earlier renders of it that
-- stopped reporting are closed; the render takes the edit's one active slot;
-- its operation and media task are created; and the edit is pointed at it.
-- Outcome: started, duplicate (same request), busy (another render is
-- active), changed (the edit was saved meanwhile) or missing. Server only.
CREATE OR REPLACE FUNCTION public.start_sequence_render(
  p_render_id uuid,
  p_task_id uuid,
  p_sequence_id uuid,
  p_version integer,
  p_timeline jsonb,
  p_dedupe_key text,
  p_user_id uuid,
  p_stalled_before timestamptz,
  p_task jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_campaign uuid;
  v_version integer;
  v_operation uuid;
  v_existing record;
BEGIN
  SELECT id, status INTO v_existing FROM public.sequence_renders WHERE dedupe_key = p_dedupe_key;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'duplicate', 'render_id', v_existing.id, 'status', v_existing.status);
  END IF;

  SELECT project_id, campaign_id, version INTO v_project, v_campaign, v_version
    FROM public.sequences WHERE id = p_sequence_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_version <> p_version THEN
    RETURN jsonb_build_object('outcome', 'changed');
  END IF;

  PERFORM public.close_stalled_renders(p_sequence_id, p_stalled_before);

  BEGIN
    INSERT INTO public.sequence_renders (id, sequence_id, sequence_version, timeline, status, stage, dedupe_key, created_by)
    VALUES (p_render_id, p_sequence_id, p_version, p_timeline, 'queued', 'Queued', p_dedupe_key, p_user_id);
  EXCEPTION WHEN unique_violation THEN
    SELECT id, status INTO v_existing FROM public.sequence_renders WHERE dedupe_key = p_dedupe_key;
    IF FOUND THEN
      RETURN jsonb_build_object('outcome', 'duplicate', 'render_id', v_existing.id, 'status', v_existing.status);
    END IF;
    RETURN jsonb_build_object('outcome', 'busy');
  END;

  INSERT INTO public.operations (created_by, project_id, campaign_id, operation_type, provider, status,
                                 input_payload, dedupe_key, submitted_at)
  VALUES (p_user_id, v_project, v_campaign, 'render_sequence', 'media_worker', 'running',
          jsonb_build_object('sequence_id', p_sequence_id, 'render_id', p_render_id, 'version', p_version),
          'render:' || p_dedupe_key, now())
  RETURNING id INTO v_operation;

  INSERT INTO public.media_tasks (id, operation_id, created_by, project_id, source_asset_id, task_type, status,
                                  storage_bucket, storage_path, input_payload, dedupe_key, submitted_at)
  VALUES (p_task_id, v_operation, p_user_id, v_project, NULLIF(p_task->>'source_asset_id', '')::uuid,
          'render_sequence', 'submitting', p_task->>'storage_bucket', p_task->>'storage_path',
          COALESCE(p_task->'input_payload', '{}'::jsonb), 'render:' || p_dedupe_key, now());

  UPDATE public.sequence_renders SET media_task_id = p_task_id WHERE id = p_render_id;
  UPDATE public.sequences SET status = 'rendering', last_render_id = p_render_id WHERE id = p_sequence_id;

  RETURN jsonb_build_object('outcome', 'started', 'render_id', p_render_id, 'operation_id', v_operation);
END $$;
REVOKE ALL ON FUNCTION public.start_sequence_render(uuid, uuid, uuid, integer, jsonb, text, uuid, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_sequence_render(uuid, uuid, uuid, integer, jsonb, text, uuid, timestamptz, jsonb)
  TO service_role;

-- A render that can't be sent is failed with its task, its operation and the
-- edit's status in one statement. Server only.
CREATE OR REPLACE FUNCTION public.fail_sequence_render(p_render_id uuid, p_error_code text, p_error_message text)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  WITH render AS (
    UPDATE public.sequence_renders
       SET status = 'failed', error_code = p_error_code, error_message = p_error_message, completed_at = now()
     WHERE id = p_render_id
       AND status IN ('queued', 'rendering')
    RETURNING sequence_id, media_task_id, sequence_version
  ), task AS (
    UPDATE public.media_tasks
       SET status = 'failed', error_code = p_error_code, error_message = p_error_message, completed_at = now()
     WHERE id IN (SELECT media_task_id FROM render)
       AND status IN ('submitting', 'processing')
    RETURNING operation_id
  ), operation AS (
    UPDATE public.operations
       SET status = 'failed', error_code = p_error_code, error_message = p_error_message, failed_at = now()
     WHERE id IN (SELECT operation_id FROM task)
       AND status = 'running'
    RETURNING id
  )
  -- Failed only while the edit is still the version the render was of: saved
  -- since, it is a draft again.
  UPDATE public.sequences AS edit
     SET status = CASE WHEN edit.version = render.sequence_version THEN 'failed' ELSE 'draft' END
    FROM render
   WHERE edit.id = render.sequence_id
     AND edit.last_render_id = p_render_id;
$$;
REVOKE ALL ON FUNCTION public.fail_sequence_render(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sequence_render(uuid, text, text) TO service_role;

-- A render that was presumed lost (its worker reports in after all) takes the
-- edit's render slot back only while the edit still points at it. The edit is
-- locked for the check and the claim, as starting a render locks it, so the
-- two happen one after the other: a replacement started first has moved the
-- edit on, and the old render stays closed even if the replacement has
-- already finished; a claim made first holds the slot, and the replacement is
-- refused as busy. Outcome: held, or closed. Server only.
CREATE OR REPLACE FUNCTION public.reclaim_sequence_render(p_render_id uuid, p_sequence_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_current uuid;
  v_claimed integer;
BEGIN
  SELECT last_render_id INTO v_current FROM public.sequences WHERE id = p_sequence_id FOR UPDATE;
  IF NOT FOUND OR v_current IS DISTINCT FROM p_render_id THEN
    RETURN 'closed';
  END IF;
  BEGIN
    UPDATE public.sequence_renders
       SET status = 'rendering', stage = 'Resuming', error_code = NULL, error_message = NULL, completed_at = NULL
     WHERE id = p_render_id
       AND sequence_id = p_sequence_id
       AND (status IN ('queued', 'rendering') OR error_code = 'STALLED');
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    -- Another render holds the slot.
    RETURN 'closed';
  END;
  RETURN CASE WHEN v_claimed > 0 THEN 'held' ELSE 'closed' END;
END $$;
REVOKE ALL ON FUNCTION public.reclaim_sequence_render(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_sequence_render(uuid, uuid) TO service_role;

-- The media worker instance that took a render. A task delivered twice can
-- reach two instances (a lost acknowledgement, then a resend); only the one
-- that claims it first goes on, so a render never runs twice.
ALTER TABLE public.media_tasks ADD COLUMN IF NOT EXISTS worker_id text;

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
