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
-- An uploaded recording is registered once: registering it again (say after
-- an answer was lost) finds that track rather than adding another.
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_upload_once
  ON public.music_tracks (asset_id) WHERE source = 'upload';

GRANT SELECT ON public.music_tracks TO authenticated;
GRANT ALL ON public.music_tracks TO service_role;

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

-- The whole team can browse and use the music; changes go through the server.
DROP POLICY IF EXISTS "members read music tracks" ON public.music_tracks;
CREATE POLICY "members read music tracks" ON public.music_tracks FOR SELECT TO authenticated
  USING (public.is_active_member());

-- A recording uploaded for its licence is recorded here by the server before
-- the browser uploads it: the server picks the file's place, and adds its
-- library record once the licence is recorded. Only the server reads or
-- writes this table (no member policies), so what it says (the place, whose
-- upload it is, how old it is) can be trusted when uploads whose licence was
-- never recorded are cleared.
CREATE TABLE IF NOT EXISTS public.music_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL,
  file_size bigint,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);
-- When the cleanup last tried an abandoned upload: one that keeps failing
-- goes to the back of the queue, so it never holds up the rest.
ALTER TABLE public.music_uploads ADD COLUMN IF NOT EXISTS cleanup_tried_at timestamptz;
DROP INDEX IF EXISTS public.music_uploads_open_idx;
CREATE INDEX music_uploads_open_idx
  ON public.music_uploads (cleanup_tried_at NULLS FIRST, created_at) WHERE registered_at IS NULL;
REVOKE ALL ON public.music_uploads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.music_uploads TO service_role;
ALTER TABLE public.music_uploads ENABLE ROW LEVEL SECURITY;

-- The library is searched and paged here, so every track stays reachable
-- however large it grows. Each word of the query must appear in the title,
-- artist, licence, genres, moods or tags (any case). It runs as the caller,
-- so the read policy above still decides what can be seen. A page starts
-- after the last track of the one before (p_after_created_at, p_after_id),
-- not at a count of rows, so a track archived or deleted meanwhile doesn't
-- move another past the page boundary unseen. (An earlier version paged by
-- offset; it is dropped so only this one is called.)
DROP FUNCTION IF EXISTS public.search_music_tracks(text, text, boolean, boolean, integer, integer);
CREATE OR REPLACE FUNCTION public.search_music_tracks(
  p_query text DEFAULT '',
  p_kind text DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_ready_only boolean DEFAULT false,
  p_limit integer DEFAULT 100,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL
) RETURNS SETOF public.music_tracks
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT track.*
    FROM public.music_tracks AS track
   WHERE (p_include_archived OR NOT track.is_archived)
     AND (p_kind IS NULL OR track.kind = p_kind)
     -- Addable means ready, with its audio still in the library (not deleted).
     AND (NOT p_ready_only OR (track.status = 'ready' AND EXISTS (
       SELECT 1 FROM public.assets AS asset
        WHERE asset.id = track.asset_id AND asset.deleted_at IS NULL
     )))
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+')) AS word
        WHERE word <> ''
          AND strpos(
                lower(concat_ws(' ', track.title, track.artist, track.license,
                  array_to_string(track.genres, ' '), array_to_string(track.moods, ' '),
                  array_to_string(track.tags, ' '))),
                word) = 0
     )
     -- After the given track in this order: older, or as old with a greater id.
     AND (p_after_created_at IS NULL
          OR track.created_at < p_after_created_at
          OR (track.created_at = p_after_created_at AND track.id > p_after_id))
   ORDER BY track.created_at DESC, track.id
   LIMIT least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
REVOKE ALL ON FUNCTION public.search_music_tracks(text, text, boolean, boolean, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_music_tracks(text, text, boolean, boolean, integer, timestamptz, uuid) TO authenticated, service_role;

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
