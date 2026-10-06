-- ============ CREATIVE STUDIO: MUSIC LIBRARY (additive, re-runnable) ============
-- Every music track in the studio carries where it came from and what the
-- team may do with it: free Creative Commons music and sound effects found
-- through Openverse, AI music made with ElevenLabs, and tracks the team owns
-- or licensed (with the licence terms recorded). The audio itself is a normal
-- library asset; this table holds the rights, credit and musical metadata.
-- Tracks are written only by the server, which validates licences and makes
-- the billable calls.

CREATE TABLE IF NOT EXISTS public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  artist text CHECK (artist IS NULL OR char_length(artist) <= 300),
  kind text NOT NULL DEFAULT 'music' CHECK (kind IN ('music','sound_effect')),
  source text NOT NULL CHECK (source IN ('openverse','elevenlabs','upload','derived')),
  source_id text,
  source_url text,
  provider text,
  license text NOT NULL CHECK (license IN ('cc0','pdm','by','ai_generated','licensed','owned')),
  license_version text,
  license_url text,
  attribution text CHECK (attribution IS NULL OR char_length(attribution) <= 1000),
  usage_notes text CHECK (usage_notes IS NULL OR char_length(usage_notes) <= 2000),
  rights jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rights) = 'object'),
  parent_track_id uuid REFERENCES public.music_tracks(id) ON DELETE SET NULL,
  duration_seconds numeric,
  bpm numeric,
  beats jsonb,
  genres text[] NOT NULL DEFAULT '{}',
  moods text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  instrumental boolean,
  prompt text CHECK (prompt IS NULL OR char_length(prompt) <= 4000),
  model text CHECK (model IS NULL OR char_length(model) <= 100),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating','ready','failed','submission_uncertain')),
  error_code text,
  error_message text,
  provider_request_id text,
  dedupe_key text UNIQUE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
-- The model a track was made with (for one made before this column existed: unknown).
ALTER TABLE public.music_tracks ADD COLUMN IF NOT EXISTS model text;
CREATE INDEX IF NOT EXISTS music_tracks_recent_idx ON public.music_tracks (created_at DESC);
CREATE INDEX IF NOT EXISTS music_tracks_asset_idx ON public.music_tracks (asset_id);
-- A track found through Openverse is imported once; importing it again reuses it.
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_openverse_once
  ON public.music_tracks (source_id) WHERE source = 'openverse';
-- Billable work is made once at a time: the same music (prompt, model, length
-- and vocals, for the same project), or an instrumental of the same track,
-- asked for again while it is being made (say after a reload forgot the
-- request) returns the work in progress rather than paying for it twice.
DROP INDEX IF EXISTS public.music_tracks_one_generation_in_progress;
CREATE UNIQUE INDEX music_tracks_one_generation_in_progress ON public.music_tracks (
  COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(model, ''),
  duration_seconds,
  instrumental,
  md5(prompt)
) WHERE status = 'generating' AND source = 'elevenlabs';
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_one_instrumental_in_progress
  ON public.music_tracks (parent_track_id) WHERE status = 'generating' AND source = 'derived';

GRANT SELECT ON public.music_tracks TO authenticated;
GRANT ALL ON public.music_tracks TO service_role;

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

-- The whole team can browse and use the music; changes go through the server.
DROP POLICY IF EXISTS "members read music tracks" ON public.music_tracks;
CREATE POLICY "members read music tracks" ON public.music_tracks FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP TRIGGER IF EXISTS music_tracks_updated ON public.music_tracks;
CREATE TRIGGER music_tracks_updated BEFORE UPDATE ON public.music_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'music_tracks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.music_tracks;
  END IF;
END $$;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('v2_music', 'Music library', 'Licensed music: free Creative Commons, AI-generated and your own licensed tracks', true)
ON CONFLICT (key) DO NOTHING;
