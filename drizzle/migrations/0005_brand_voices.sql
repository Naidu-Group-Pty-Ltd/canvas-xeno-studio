-- ============ CREATIVE STUDIO: BRAND VOICES AND VOICEOVERS (additive, re-runnable) ============
-- A brand voice is a fixed speaking persona: one provider voice with fixed
-- settings, a pronunciation list and script guidelines, so every voiceover in a
-- campaign (or for a whole brand) sounds like the same person. Campaigns and
-- projects can each name their voice; one voice can be the studio default.
-- Voiceovers are written only by the server, which makes the billable calls.
-- (Avatar Studio keeps its own, separate avatar_voices.)

CREATE TABLE IF NOT EXISTS public.brand_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  provider text NOT NULL CHECK (provider IN ('openai','elevenlabs')),
  provider_voice_id text NOT NULL CHECK (char_length(provider_voice_id) BETWEEN 1 AND 200),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  language text,
  pronunciations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pronunciations) = 'array'),
  script_guidelines text CHECK (script_guidelines IS NULL OR char_length(script_guidelines) <= 2000),
  sample_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_voices_recent_idx ON public.brand_voices (updated_at DESC);
-- At most one studio-wide default voice.
CREATE UNIQUE INDEX IF NOT EXISTS brand_voices_one_default ON public.brand_voices (is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.voiceovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  script text NOT NULL CHECK (char_length(script) BETWEEN 1 AND 5000),
  spoken_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','completed','failed','submission_uncertain')),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  duration_seconds numeric,
  alignment jsonb,
  provider text,
  model text,
  provider_voice_id text,
  provider_request_id text,
  characters integer,
  error_code text,
  error_message text,
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  dedupe_key text UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS voiceovers_sequence_idx ON public.voiceovers (sequence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voiceovers_recent_idx ON public.voiceovers (created_at DESC);

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

GRANT SELECT ON public.brand_voices, public.voiceovers TO authenticated;
GRANT ALL ON public.brand_voices, public.voiceovers TO service_role;

ALTER TABLE public.brand_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voiceovers ENABLE ROW LEVEL SECURITY;

-- Everyone on the team can see and use the brand voices; changes go through
-- the server, which validates them and talks to the voice providers.
DROP POLICY IF EXISTS "members read brand voices" ON public.brand_voices;
CREATE POLICY "members read brand voices" ON public.brand_voices FOR SELECT TO authenticated
  USING (public.is_active_member());
DROP POLICY IF EXISTS "members read voiceovers" ON public.voiceovers;
CREATE POLICY "members read voiceovers" ON public.voiceovers FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP TRIGGER IF EXISTS brand_voices_updated ON public.brand_voices;
CREATE TRIGGER brand_voices_updated BEFORE UPDATE ON public.brand_voices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS voiceovers_updated ON public.voiceovers;
CREATE TRIGGER voiceovers_updated BEFORE UPDATE ON public.voiceovers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'voiceovers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voiceovers;
  END IF;
END $$;

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('v2_brand_voices', 'Brand voices', 'Consistent voiceover personas for brands and campaigns', true)
ON CONFLICT (key) DO NOTHING;
