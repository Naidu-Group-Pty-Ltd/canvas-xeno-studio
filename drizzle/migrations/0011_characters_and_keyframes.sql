-- ============ CREATIVE STUDIO: CHARACTERS, KEYFRAMES, IDENTITY CHECKS (additive, re-runnable) ============
-- Characters are the team's people and mascots who must look the same in
-- everything they appear in: a reference sheet (the images every clip and
-- keyframe is sent, best view first), photos a Soul ID can be trained on, and
-- a short description of the look. (Separate from Avatar Studio's
-- avatar_characters, which are HeyGen presenters.)
--
-- Long videos can keep characters consistent three ways, together:
--   * their reference images go with every clip whose model takes them;
--   * keyframes: the frame each clip ends on is painted first, from the
--     characters' sheets, so no clip can drift further than one clip;
--   * an identity check after every clip stops the run before the next paid
--     clip when someone has changed.
--
-- Members read all of it in the studio; only the server writes it.

CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  -- The look in words (age, build, face, hair, clothes), added to every prompt.
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  -- Soul ID: Higgsfield's trained character reference (billed). The one in
  -- use (soul_reference_id, for soul_model_version: v1 Soul Standard, v2 Soul
  -- 2, cinema Soul Cinema) stays in use while a new one trains, and after a
  -- training that fails; a new one replaces it only once it is ready.
  soul_model_version text CHECK (soul_model_version IN ('v1', 'v2', 'cinema')),
  soul_reference_id text CHECK (char_length(soul_reference_id) <= 100),
  -- The latest training. none: never trained; submitting: being started;
  -- training; ready (now in use); failed; uncertain: the answer was unclear,
  -- so it is never retried without a person.
  soul_status text NOT NULL DEFAULT 'none'
    CHECK (soul_status IN ('none', 'submitting', 'training', 'ready', 'failed', 'uncertain')),
  soul_training_version text CHECK (soul_training_version IN ('v1', 'v2', 'cinema')),
  -- Higgsfield's id for it, once Higgsfield has answered.
  soul_training_id text CHECK (char_length(soul_training_id) <= 100),
  -- One key per training request, sent to Higgsfield so a repeat never trains twice.
  soul_request_key text UNIQUE CHECK (char_length(soul_request_key) <= 64),
  soul_error text,
  soul_image_count integer,
  soul_requested_at timestamptz,
  -- When the training request itself went to Higgsfield: a start cut short
  -- before this was never sent (nothing charged); one cut short after it may
  -- be training (uncertain).
  soul_submitted_at timestamptz,
  soul_checked_at timestamptz,
  soul_ready_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Taken out of the library (runs keep their own copy of what they used).
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS characters_library_idx ON public.characters (updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS characters_soul_idx ON public.characters (soul_checked_at)
  WHERE soul_status IN ('submitting', 'training');

CREATE TABLE IF NOT EXISTS public.character_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  -- sheet: sent with every clip and keyframe; photo: only for training a Soul ID.
  role text NOT NULL DEFAULT 'sheet' CHECK (role IN ('sheet', 'photo')),
  -- What it shows, which decides what is sent first when not all fit.
  view text NOT NULL DEFAULT 'other'
    CHECK (view IN ('face', 'front', 'three_quarter', 'side', 'back', 'outfit', 'expression', 'other')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, asset_id)
);
CREATE INDEX IF NOT EXISTS character_images_character_idx ON public.character_images (character_id, position);
CREATE INDEX IF NOT EXISTS character_images_asset_idx ON public.character_images (asset_id);

DROP TRIGGER IF EXISTS characters_set_updated_at ON public.characters;
CREATE TRIGGER characters_set_updated_at BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Long videos: characters, keyframes, identity checks ----------

-- What the run was made with: its characters as they were when it started.
ALTER TABLE public.long_videos
  ADD COLUMN IF NOT EXISTS characters jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(characters) = 'array');
-- Every clip is checked against the characters' reference images.
ALTER TABLE public.long_videos ADD COLUMN IF NOT EXISTS identity_check boolean NOT NULL DEFAULT false;
-- Keyframes: the image model that paints them (none: the run has none), its
-- settings, whether a person reviews them before the clips are made, and when
-- they were approved (the clips start then). A run waiting on a person
-- (keyframes to review, a character who changed) is needs_attention with a
-- code saying why (STORYBOARD_READY, CHARACTER_CHECK, ...), so no status is new.
ALTER TABLE public.long_videos ADD COLUMN IF NOT EXISTS keyframe_model_id uuid REFERENCES public.model_registry(id);
ALTER TABLE public.long_videos
  ADD COLUMN IF NOT EXISTS keyframe_settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(keyframe_settings) = 'object');
ALTER TABLE public.long_videos ADD COLUMN IF NOT EXISTS storyboard_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.long_videos ADD COLUMN IF NOT EXISTS storyboard_approved_at timestamptz;

-- The keyframe a clip ended on, and its identity check: sample frames taken
-- (sampling), compared with the characters' images (checking, under a lease
-- so one worker writes its result), then passed, flagged (someone changed:
-- the run stops), accepted (kept anyway by a person), unavailable (couldn't
-- be checked; the run goes on) or skipped. check_attempts counts checks that
-- failed; check_claims every lease taken (one cut short isn't a failure).
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS end_frame_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
ALTER TABLE public.long_video_clips
  ADD COLUMN IF NOT EXISTS check_status text NOT NULL DEFAULT 'none'
    CHECK (check_status IN ('none', 'sampling', 'checking', 'passed', 'flagged', 'accepted', 'unavailable', 'skipped'));
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS check_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS check_attempts integer NOT NULL DEFAULT 0 CHECK (check_attempts >= 0);
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS check_claims integer NOT NULL DEFAULT 0 CHECK (check_claims >= 0);
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS check_result jsonb;
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS check_claimed_at timestamptz;
ALTER TABLE public.long_video_clips ADD COLUMN IF NOT EXISTS checked_at timestamptz;
CREATE INDEX IF NOT EXISTS long_video_clips_check_task_idx ON public.long_video_clips (check_task_id);

-- Keyframes: 0 is the frame the video opens on; i the frame clip i ends on.
CREATE TABLE IF NOT EXISTS public.long_video_keyframes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  long_video_id uuid NOT NULL REFERENCES public.long_videos(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0 AND position <= 40),
  -- What it is painted from, and what a person asked to change on a redo.
  prompt text NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 12000),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  -- waiting; submitting: being started; generating: being painted (or saved);
  -- sizing: being cut to the video's exact frame size; completed; failed.
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'submitting', 'generating', 'sizing', 'completed', 'failed')),
  -- Each try is a separate generation; a redo starts the next attempt.
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  -- The image as painted, then the keyframe itself (cut to the frame size).
  raw_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  size_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  size_attempts integer NOT NULL DEFAULT 0 CHECK (size_attempts >= 0),
  -- The person's own image (their opening frame), not painted.
  provided boolean NOT NULL DEFAULT false,
  check_status text NOT NULL DEFAULT 'none'
    CHECK (check_status IN ('none', 'checking', 'passed', 'flagged', 'accepted', 'unavailable', 'skipped')),
  check_attempts integer NOT NULL DEFAULT 0 CHECK (check_attempts >= 0),
  check_claims integer NOT NULL DEFAULT 0 CHECK (check_claims >= 0),
  check_result jsonb,
  check_claimed_at timestamptz,
  checked_at timestamptz,
  error_code text,
  error_message text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (long_video_id, position)
);
CREATE INDEX IF NOT EXISTS long_video_keyframes_generation_idx ON public.long_video_keyframes (generation_id);
CREATE INDEX IF NOT EXISTS long_video_keyframes_task_idx ON public.long_video_keyframes (size_task_id);

DROP TRIGGER IF EXISTS long_video_keyframes_set_updated_at ON public.long_video_keyframes;
CREATE TRIGGER long_video_keyframes_set_updated_at BEFORE UPDATE ON public.long_video_keyframes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Access: members read; the server writes ----------

REVOKE ALL ON public.characters, public.character_images, public.long_video_keyframes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.characters, public.character_images, public.long_video_keyframes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters, public.character_images, public.long_video_keyframes TO service_role;

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.long_video_keyframes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read characters" ON public.characters;
CREATE POLICY "members read characters" ON public.characters FOR SELECT TO authenticated
  USING (public.is_active_member());
DROP POLICY IF EXISTS "members read character images" ON public.character_images;
CREATE POLICY "members read character images" ON public.character_images FOR SELECT TO authenticated
  USING (public.is_active_member());
DROP POLICY IF EXISTS "members read long video keyframes" ON public.long_video_keyframes;
CREATE POLICY "members read long video keyframes" ON public.long_video_keyframes FOR SELECT TO authenticated
  USING (public.is_active_member());

-- Changes show live in the studio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'characters') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'character_images') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.character_images;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'long_video_keyframes') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.long_video_keyframes;
    END IF;
  END IF;
END $$;

-- ---------- Steps that must not interleave (server only) ----------
-- Starting a clip of a keyframed run, approving its storyboard and painting
-- its keyframes again each lock the run's row first, so they happen one after
-- the other: a clip never starts on a keyframe that is being painted again,
-- an approval never lands while a keyframe is still to be painted, and a
-- keyframe a clip has started with is never painted again.

-- A clip of a keyframed run is claimed only while its storyboard is approved.
-- Outcome: claimed (with the attempt), taken (not waiting any more), or
-- storyboard (not approved: its keyframes come first).
CREATE OR REPLACE FUNCTION public.claim_long_video_clip(p_clip_id uuid, p_claimed_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_run uuid;
  v_keyframed boolean;
  v_approved timestamptz;
  v_attempt integer;
BEGIN
  SELECT long_video_id INTO v_run FROM public.long_video_clips WHERE id = p_clip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'taken');
  END IF;
  SELECT keyframe_model_id IS NOT NULL, storyboard_approved_at INTO v_keyframed, v_approved
    FROM public.long_videos WHERE id = v_run FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'taken');
  END IF;
  IF v_keyframed AND v_approved IS NULL THEN
    RETURN jsonb_build_object('outcome', 'storyboard');
  END IF;
  UPDATE public.long_video_clips
     SET status = 'submitting', claimed_at = p_claimed_at, error_code = NULL, error_message = NULL
   WHERE id = p_clip_id AND status = 'waiting'
  RETURNING attempt INTO v_attempt;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'taken');
  END IF;
  RETURN jsonb_build_object('outcome', 'claimed', 'attempt', v_attempt);
END $$;
REVOKE ALL ON FUNCTION public.claim_long_video_clip(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_long_video_clip(uuid, timestamptz) TO service_role;

-- Approves a keyframed run's storyboard once every keyframe is painted and, in
-- a run that checks its characters, checked. A person's approval keeps any
-- flagged keyframe (they have seen it) and picks the run up again; the run's
-- own (review off) only goes ahead when none is flagged.
-- Outcome: approved, unfinished (with the first keyframe still to come),
-- flagged, or missing.
CREATE OR REPLACE FUNCTION public.approve_long_video_storyboard(p_run_id uuid, p_by_person boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_checks boolean;
  v_pending record;
BEGIN
  SELECT id, status, keyframe_model_id, storyboard_approved_at, identity_check, characters
    INTO v_run FROM public.long_videos WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.keyframe_model_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_run.storyboard_approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'approved');
  END IF;
  IF NOT p_by_person AND v_run.status <> 'running' THEN
    RETURN jsonb_build_object('outcome', 'unfinished');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.long_video_keyframes WHERE long_video_id = p_run_id) THEN
    RETURN jsonb_build_object('outcome', 'unfinished');
  END IF;
  v_checks := v_run.identity_check AND jsonb_typeof(v_run.characters) = 'array'
    AND jsonb_array_length(v_run.characters) > 0;
  SELECT position, status, error_code INTO v_pending
    FROM public.long_video_keyframes
   WHERE long_video_id = p_run_id
     AND (status <> 'completed'
          OR (v_checks AND NOT provided
              AND check_status NOT IN ('passed', 'accepted', 'unavailable', 'skipped', 'flagged')))
   ORDER BY position
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'unfinished', 'position', v_pending.position,
                              'status', v_pending.status, 'error_code', v_pending.error_code);
  END IF;
  IF NOT p_by_person AND EXISTS (
    SELECT 1 FROM public.long_video_keyframes WHERE long_video_id = p_run_id AND check_status = 'flagged'
  ) THEN
    RETURN jsonb_build_object('outcome', 'flagged');
  END IF;
  UPDATE public.long_video_keyframes SET check_status = 'accepted'
   WHERE long_video_id = p_run_id AND check_status = 'flagged';
  UPDATE public.long_videos
     SET storyboard_approved_at = now(),
         status = CASE WHEN status IN ('needs_attention', 'canceled') THEN 'running' ELSE status END,
         error_code = CASE WHEN status IN ('needs_attention', 'canceled') THEN NULL ELSE error_code END,
         error_message = CASE WHEN status IN ('needs_attention', 'canceled') THEN NULL ELSE error_message END,
         completed_at = NULL
   WHERE id = p_run_id;
  RETURN jsonb_build_object('outcome', 'approved');
END $$;
REVOKE ALL ON FUNCTION public.approve_long_video_storyboard(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_long_video_storyboard(uuid, boolean) TO service_role;

-- Paints keyframes again, each as a new attempt (billed), while no clip that
-- starts or ends on them has started (clip 1 starts on keyframe 0; clip i
-- ends on keyframe i). Clips stopped because a keyframe was missing wait
-- again (nothing was paid for them), and the storyboard is looked over again
-- before any clip carries on, whatever the run was set to.
-- Outcome: redone; started (with the first such clip's position); painting
-- (one is being painted now); uncertain (one may be painting at Higgsfield
-- and that wasn't confirmed; with its position); provided (one is the
-- person's own image); stopped (the run is stopped); or missing.
CREATE OR REPLACE FUNCTION public.redo_long_video_keyframes(
  p_run_id uuid,
  p_keyframe_ids uuid[],
  p_target_id uuid,
  p_note text,
  p_confirm_uncertain boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_first integer;
  v_count integer;
  v_clip integer;
  v_uncertain integer;
BEGIN
  SELECT status INTO v_status FROM public.long_videos WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_status = 'canceled' THEN
    RETURN jsonb_build_object('outcome', 'stopped');
  END IF;
  PERFORM 1 FROM public.long_video_keyframes
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids) FOR UPDATE;
  SELECT min(position), count(*) INTO v_first, v_count FROM public.long_video_keyframes
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids);
  IF v_count = 0 OR v_count <> cardinality(p_keyframe_ids) THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF EXISTS (SELECT 1 FROM public.long_video_keyframes
              WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids) AND provided) THEN
    RETURN jsonb_build_object('outcome', 'provided');
  END IF;
  SELECT position INTO v_clip FROM public.long_video_clips
   WHERE long_video_id = p_run_id
     AND position >= GREATEST(v_first - 1, 0)
     AND status IN ('submitting', 'generating', 'completed')
   ORDER BY position
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'started', 'position', v_clip);
  END IF;
  IF EXISTS (SELECT 1 FROM public.long_video_keyframes
              WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids)
                AND status IN ('submitting', 'generating', 'sizing')) THEN
    RETURN jsonb_build_object('outcome', 'painting');
  END IF;
  IF NOT p_confirm_uncertain THEN
    SELECT position INTO v_uncertain FROM public.long_video_keyframes
     WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids)
       AND status = 'failed' AND error_code = 'SUBMISSION_UNCERTAIN'
     ORDER BY position
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('outcome', 'uncertain', 'position', v_uncertain);
    END IF;
  END IF;

  UPDATE public.long_video_keyframes
     SET status = 'waiting',
         attempt = attempt + 1,
         generation_id = NULL,
         raw_asset_id = NULL,
         asset_id = NULL,
         size_task_id = NULL,
         size_attempts = 0,
         check_status = 'none',
         check_attempts = 0,
         check_claims = 0,
         check_result = NULL,
         check_claimed_at = NULL,
         checked_at = NULL,
         note = CASE WHEN id = p_target_id THEN left(btrim(coalesce(p_note, '')), 1000) ELSE note END,
         error_code = NULL,
         error_message = NULL,
         claimed_at = NULL,
         started_at = NULL,
         completed_at = NULL
   WHERE long_video_id = p_run_id AND id = ANY(p_keyframe_ids);
  UPDATE public.long_video_clips
     SET status = 'waiting', claimed_at = NULL, error_code = NULL, error_message = NULL
   WHERE long_video_id = p_run_id AND status = 'failed' AND error_code = 'KEYFRAME_MISSING';
  UPDATE public.long_videos
     SET storyboard_approved_at = NULL,
         storyboard_review = true,
         status = 'running',
         error_code = NULL,
         error_message = NULL,
         completed_at = NULL
   WHERE id = p_run_id;
  RETURN jsonb_build_object('outcome', 'redone');
END $$;
REVOKE ALL ON FUNCTION public.redo_long_video_keyframes(uuid, uuid[], uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redo_long_video_keyframes(uuid, uuid[], uuid, text, boolean) TO service_role;
