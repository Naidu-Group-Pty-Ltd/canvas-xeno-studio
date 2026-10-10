-- ============ CREATIVE STUDIO: LONG VIDEOS (chained clips; additive, re-runnable) ============
-- A long video is one continuous piece made of several generated clips, each
-- no longer than its model allows. Clips run one after another: each starts
-- from a frame taken just before the end of the clip before it (its "handoff"
-- frame), so the action, framing and lighting carry straight on. When the last
-- clip is in, the whole run can be opened in the Editor, cut at the handoff
-- frames so the joins are seamless.
--
-- The server runs the chain (webhooks, media-service callbacks and the
-- reconcile job all move it on), so nothing depends on a browser staying open.
-- Members can follow a run; only the server writes it.

CREATE TABLE IF NOT EXISTS public.long_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Long video' CHECK (char_length(title) BETWEEN 1 AND 200),
  -- running: clips are being made; needs_attention: stopped on a problem a
  -- person has to look at; completed: every clip is in; canceled: stopped.
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'needs_attention', 'completed', 'canceled')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  -- The first clip's model, and the model every later clip uses (one that
  -- starts from an image, so it can start from the handoff frame).
  first_model_id uuid NOT NULL REFERENCES public.model_registry(id),
  continuation_model_id uuid NOT NULL REFERENCES public.model_registry(id),
  -- What the whole video is about, and what must stay the same in every clip.
  story text NOT NULL DEFAULT '' CHECK (char_length(story) <= 8000),
  continuity text NOT NULL DEFAULT '' CHECK (char_length(continuity) <= 2000),
  target_seconds numeric NOT NULL CHECK (target_seconds > 0 AND target_seconds <= 600),
  clip_count integer NOT NULL CHECK (clip_count BETWEEN 2 AND 40),
  -- The settings and references the run was started with, for reference and reuse.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  references_used jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(references_used) = 'array'),
  -- The edit made from it, once someone opens it in the Editor.
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL,
  -- A repeated Generate press carries the same key and starts nothing new.
  client_request_id text UNIQUE CHECK (char_length(client_request_id) <= 64),
  error_code text,
  error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS long_videos_recent_idx ON public.long_videos (created_at DESC);
CREATE INDEX IF NOT EXISTS long_videos_running_idx ON public.long_videos (updated_at) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.long_video_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  long_video_id uuid NOT NULL REFERENCES public.long_videos(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0 AND position < 40),
  model_registry_id uuid NOT NULL REFERENCES public.model_registry(id),
  -- What happens in this clip (optional), and the full prompt it is sent with.
  beat text NOT NULL DEFAULT '' CHECK (char_length(beat) <= 2000),
  prompt text NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 12000),
  duration_seconds numeric NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 120),
  -- The model settings the clip is generated with (prompt and length included).
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
  -- Media sent with the clip besides its start frame: [{asset_id, role}].
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inputs) = 'array'),
  -- waiting: not started; submitting: being started; generating: its
  -- generation is running or being saved; completed: its video is in the
  -- library; failed: the generation didn't produce a video; canceled.
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'submitting', 'generating', 'completed', 'failed', 'canceled')),
  -- Each try at the clip is a separate generation; a retry starts the next attempt.
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  start_frame_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  output_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- The clip's video as measured by the media service.
  output_duration_seconds numeric,
  output_fps numeric,
  output_width integer,
  output_height integer,
  -- Taking the next clip's start frame from this one: measure the video
  -- (probing), take the frame (extracting), then ready. The last clip needs none.
  handoff_status text NOT NULL DEFAULT 'none'
    CHECK (handoff_status IN ('none', 'probing', 'extracting', 'ready', 'failed', 'not_needed')),
  handoff_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  handoff_attempts integer NOT NULL DEFAULT 0 CHECK (handoff_attempts >= 0),
  -- Where the Editor cuts this clip: the handoff frame is the first frame after it.
  handoff_time_seconds numeric,
  handoff_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (long_video_id, position)
);
CREATE INDEX IF NOT EXISTS long_video_clips_generation_idx ON public.long_video_clips (generation_id);
CREATE INDEX IF NOT EXISTS long_video_clips_task_idx ON public.long_video_clips (handoff_task_id);

DROP TRIGGER IF EXISTS long_videos_set_updated_at ON public.long_videos;
CREATE TRIGGER long_videos_set_updated_at BEFORE UPDATE ON public.long_videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS long_video_clips_set_updated_at ON public.long_video_clips;
CREATE TRIGGER long_video_clips_set_updated_at BEFORE UPDATE ON public.long_video_clips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Members follow runs in the studio; starting, retrying and stopping go through
-- the server, which checks the request, so the browser never writes these.
REVOKE ALL ON public.long_videos, public.long_video_clips FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.long_videos, public.long_video_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.long_videos, public.long_video_clips TO service_role;

ALTER TABLE public.long_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.long_video_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read long videos" ON public.long_videos;
CREATE POLICY "members read long videos" ON public.long_videos FOR SELECT TO authenticated
  USING (public.is_active_member());
DROP POLICY IF EXISTS "members read long video clips" ON public.long_video_clips;
CREATE POLICY "members read long video clips" ON public.long_video_clips FOR SELECT TO authenticated
  USING (public.is_active_member());

-- Progress shows live in the studio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'long_videos') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.long_videos;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'long_video_clips') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.long_video_clips;
    END IF;
  END IF;
END $$;
