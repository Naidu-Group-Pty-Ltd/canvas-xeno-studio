-- ============ CREATIVE STUDIO: VOICEOVERS THAT DRIVE LIP SYNC (additive, re-runnable) ============
-- A voiceover can drive a video's lips: a model with driving audio (Wan 2.6
-- and 2.7) moves the picture to the sound it is given, from the clip's first
-- frame. For the lips and the voiceover to meet again in the Editor, every
-- time has to be a time in one exact file, so a voiceover is first prepared by
-- the media service: made into a canonical WAV (48 kHz mono PCM, with no
-- encoder delay to read differently from one program to the next), with its
-- speech and the pauses between found.
--
-- A long video made to a voiceover is cut into clips only in its pauses, on
-- the frame grid, and each clip is made from its own piece of the voiceover.
-- Where each clip put the speech is measured from the clip's own sound, and
-- the Editor lays the clips and the voiceover so they meet to the frame.
--
-- Members follow preparations and runs; only the server writes them.

CREATE TABLE IF NOT EXISTS public.audio_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The voiceover as given: an audio (or video) file in the library. One
  -- preparation per file: asked again, the same one is used.
  source_asset_id uuid NOT NULL UNIQUE REFERENCES public.assets(id) ON DELETE CASCADE,
  -- preparing: with the media service; ready: the canonical file and what was
  -- found in it are in; failed: it couldn't be prepared (error_message says why).
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'ready', 'failed')),
  media_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- The canonical file: what each clip's piece is cut from and the Editor plays.
  prepared_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- Its 16 kHz copy, kept for transcription only.
  speech_storage_bucket text,
  speech_storage_path text,
  sample_rate integer CHECK (sample_rate IS NULL OR sample_rate > 0),
  samples bigint CHECK (samples IS NULL OR samples > 0),
  duration_seconds numeric CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 601)),
  -- What the media service found: speech, pauses, levels and a waveform.
  analysis jsonb CHECK (analysis IS NULL OR jsonb_typeof(analysis) = 'object'),
  -- What is said, with each word's timing, where it could be transcribed:
  -- none (not asked), pending, ready, unavailable (no transcription service,
  -- or it couldn't make one out).
  transcript_status text NOT NULL DEFAULT 'none'
    CHECK (transcript_status IN ('none', 'pending', 'ready', 'unavailable')),
  transcript text CHECK (transcript IS NULL OR char_length(transcript) <= 20000),
  words jsonb CHECK (words IS NULL OR jsonb_typeof(words) = 'array'),
  -- For a recording someone made: who confirmed the brand may use the voice in
  -- it, and when (the confirmation the Editor's import asks for).
  consent jsonb CHECK (consent IS NULL OR jsonb_typeof(consent) = 'object'),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS audio_preparations_task_idx ON public.audio_preparations (media_task_id);
CREATE INDEX IF NOT EXISTS audio_preparations_preparing_idx ON public.audio_preparations (updated_at)
  WHERE status = 'preparing';

DROP TRIGGER IF EXISTS audio_preparations_set_updated_at ON public.audio_preparations;
CREATE TRIGGER audio_preparations_set_updated_at BEFORE UPDATE ON public.audio_preparations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A long video made to a voiceover: the voiceover's preparation, and the plan
-- it was run with ({prepared_asset_id, duration_seconds, sample_rate, samples,
-- fps, headroom_seconds, title, keep_clip_sound}).
ALTER TABLE public.long_videos
  ADD COLUMN IF NOT EXISTS voiceover_preparation_id uuid REFERENCES public.audio_preparations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voiceover jsonb CHECK (voiceover IS NULL OR jsonb_typeof(voiceover) = 'object');

-- Each clip's piece of the voiceover (seconds on the voiceover's clock, the
-- start on the frame grid), the file cut for it (sent as its driving audio),
-- and where the clip put the speech, measured from its own sound:
--   none: not measured yet (or the clip isn't made to a voiceover);
--   measuring: with the media service;
--   measured: sync_offset_seconds is where the speech is (positive: later in
--     the clip than in its piece);
--   unverified: it couldn't be measured (no sound in the clip, or nothing
--     clear to match), so the clip is taken as in step;
--   failed: the media service couldn't measure it after several tries.
ALTER TABLE public.long_video_clips
  ADD COLUMN IF NOT EXISTS audio_start_seconds numeric CHECK (audio_start_seconds IS NULL OR audio_start_seconds >= 0),
  ADD COLUMN IF NOT EXISTS audio_end_seconds numeric CHECK (audio_end_seconds IS NULL OR audio_end_seconds > 0),
  ADD COLUMN IF NOT EXISTS audio_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'none'
    CHECK (sync_status IN ('none', 'measuring', 'measured', 'unverified', 'failed')),
  ADD COLUMN IF NOT EXISTS sync_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0 CHECK (sync_attempts >= 0),
  ADD COLUMN IF NOT EXISTS sync_offset_seconds numeric,
  ADD COLUMN IF NOT EXISTS sync_result jsonb CHECK (sync_result IS NULL OR jsonb_typeof(sync_result) = 'object'),
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'long_video_clips_audio_window_check'
  ) THEN
    ALTER TABLE public.long_video_clips ADD CONSTRAINT long_video_clips_audio_window_check
      CHECK (
        (audio_start_seconds IS NULL AND audio_end_seconds IS NULL)
        OR (audio_start_seconds IS NOT NULL AND audio_end_seconds IS NOT NULL AND audio_end_seconds > audio_start_seconds)
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS long_video_clips_sync_task_idx ON public.long_video_clips (sync_task_id);

-- Members follow preparations in the studio; preparing goes through the
-- server, which checks the request, so the browser never writes these.
REVOKE ALL ON public.audio_preparations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audio_preparations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_preparations TO service_role;

ALTER TABLE public.audio_preparations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read audio preparations" ON public.audio_preparations;
CREATE POLICY "members read audio preparations" ON public.audio_preparations FOR SELECT TO authenticated
  USING (public.is_active_member());

-- Progress shows live in the studio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audio_preparations') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.audio_preparations;
    END IF;
  END IF;
END $$;
