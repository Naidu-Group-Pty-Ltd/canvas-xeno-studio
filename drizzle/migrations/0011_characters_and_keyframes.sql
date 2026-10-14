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
  -- Soul ID: Higgsfield's trained character reference (billed). none: never
  -- trained; submitting: being started; training; ready; failed; uncertain:
  -- the start's answer was unclear, so it is never retried without a person.
  soul_status text NOT NULL DEFAULT 'none'
    CHECK (soul_status IN ('none', 'submitting', 'training', 'ready', 'failed', 'uncertain')),
  -- The Soul family it works with: v1 (Soul Standard), v2 (Soul 2), cinema (Soul Cinema).
  soul_model_version text CHECK (soul_model_version IN ('v1', 'v2', 'cinema')),
  soul_reference_id text CHECK (char_length(soul_reference_id) <= 100),
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
