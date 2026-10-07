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
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  source jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source) = 'object'),
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A voice kept for one project can't speak for the whole studio.
  CONSTRAINT brand_voices_default_for_any_project CHECK (NOT is_default OR project_id IS NULL)
);
CREATE INDEX IF NOT EXISTS brand_voices_recent_idx ON public.brand_voices (updated_at DESC);
-- A voice kept for one project goes with the project: if the project is
-- deleted, so is the voice, rather than becoming a voice for every project
-- (no project means "any project"). Its takes keep their provider voice id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.brand_voices'::regclass AND conname = 'brand_voices_project_id_fkey' AND confdeltype <> 'c'
  ) THEN
    ALTER TABLE public.brand_voices DROP CONSTRAINT brand_voices_project_id_fkey;
    ALTER TABLE public.brand_voices ADD CONSTRAINT brand_voices_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;
-- A voice kept for one project can't be the studio default: where the table
-- was made before that rule, it is added here, and a project's voice marked
-- the default stops being it (outside its project it was never used as one).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.brand_voices'::regclass AND conname = 'brand_voices_default_for_any_project'
  ) THEN
    UPDATE public.brand_voices SET is_default = false WHERE is_default AND project_id IS NOT NULL;
    ALTER TABLE public.brand_voices ADD CONSTRAINT brand_voices_default_for_any_project
      CHECK (NOT is_default OR project_id IS NULL);
  END IF;
END $$;
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
-- The same script, by the same voice, for the same work is made once at a
-- time: asked for again while it is being made (say its answer was lost and a
-- reload forgot the request), that take is returned rather than paid for twice.
-- (Rebuilt on every run, so an environment with an earlier version of it gets
-- the campaign too: takes for two campaigns are never taken for one another.)
DROP INDEX IF EXISTS public.voiceovers_one_in_progress;
CREATE UNIQUE INDEX voiceovers_one_in_progress ON public.voiceovers (
  COALESCE(sequence_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
  voice_id,
  md5(script)
) WHERE status = 'generating';

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brand_voice_id uuid REFERENCES public.brand_voices(id) ON DELETE SET NULL;

-- A voice kept for one project can only be assigned within that project. Choosing
-- another project's voice is refused; a campaign that moves to another project
-- drops a voice that doesn't belong there (and falls back to the next level).
-- An assignment takes turns with a move of the voice to a project
-- (brand_voice_keeps_uses, below), so the two can't pass each other.
CREATE OR REPLACE FUNCTION public.brand_voice_in_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  voice_project uuid;
  row_project uuid;
BEGIN
  IF NEW.brand_voice_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.brand_voices.scope'), hashtext(NEW.brand_voice_id::text));
  SELECT project_id INTO voice_project FROM public.brand_voices WHERE id = NEW.brand_voice_id;
  IF voice_project IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'projects' THEN
    row_project := NEW.id;
  ELSE
    row_project := NEW.project_id;
  END IF;
  IF row_project IS NOT DISTINCT FROM voice_project THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.brand_voice_id IS NOT DISTINCT FROM OLD.brand_voice_id THEN
    NEW.brand_voice_id := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'That brand voice is kept for another project. Choose a voice for this project, or one for any project.'
    USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS campaigns_brand_voice_in_scope ON public.campaigns;
CREATE TRIGGER campaigns_brand_voice_in_scope BEFORE INSERT OR UPDATE OF brand_voice_id, project_id ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.brand_voice_in_scope();
DROP TRIGGER IF EXISTS projects_brand_voice_in_scope ON public.projects;
CREATE TRIGGER projects_brand_voice_in_scope BEFORE INSERT OR UPDATE OF brand_voice_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.brand_voice_in_scope();

-- The other way round: a voice moved into one project can't leave campaigns
-- or projects elsewhere using it. Checked when it moves, taking turns with
-- assignments of the voice (brand_voice_in_scope), so a move and an
-- assignment made at the same moment can't both go through.
CREATE OR REPLACE FUNCTION public.brand_voice_keeps_uses() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_id IS NULL OR NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.brand_voices.scope'), hashtext(NEW.id::text));
  IF EXISTS (SELECT 1 FROM public.campaigns WHERE brand_voice_id = NEW.id AND project_id IS DISTINCT FROM NEW.project_id)
     OR EXISTS (SELECT 1 FROM public.projects WHERE brand_voice_id = NEW.id AND id <> NEW.project_id) THEN
    RAISE EXCEPTION 'This voice is the brand voice of campaigns or projects outside that project. Give them another voice first, or keep this one for any project.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS brand_voices_keep_uses ON public.brand_voices;
CREATE TRIGGER brand_voices_keep_uses BEFORE UPDATE OF project_id ON public.brand_voices
  FOR EACH ROW EXECUTE FUNCTION public.brand_voice_keeps_uses();

-- The studio default changes in one transaction: the old default is cleared
-- and the new one set together, so a failure part-way never leaves the studio
-- without one, and changes are made one at a time. Outcome: set, missing, or
-- project (a voice kept for one project can't be the default). Server only.
CREATE OR REPLACE FUNCTION public.set_default_brand_voice(p_voice_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_project uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.brand_voices.is_default'));
  SELECT project_id INTO v_project FROM public.brand_voices WHERE id = p_voice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  IF v_project IS NOT NULL THEN
    RETURN 'project';
  END IF;
  UPDATE public.brand_voices SET is_default = false WHERE is_default AND id <> p_voice_id;
  UPDATE public.brand_voices SET is_default = true, is_archived = false WHERE id = p_voice_id;
  RETURN 'set';
END $$;
REVOKE ALL ON FUNCTION public.set_default_brand_voice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_brand_voice(uuid) TO service_role;

-- A voice added to ElevenLabs whose answer was lost is found later as a new
-- voice of its name. Each such voice goes to one attempt only: checks take
-- turns with each other and with recording an addition that was answered
-- (record_added_voice); a voice another attempt already has, or that is
-- already a brand voice, is passed over; and while another attempt of that
-- name is still being added (its answer may still come), nothing is taken.
-- Outcome: claimed (with the attempt's voice, also when it already had one),
-- pending (none of these is free yet), many (more than one is, so it can't
-- tell which), changed (the attempt was settled otherwise meanwhile) or
-- missing. Server only.
CREATE OR REPLACE FUNCTION public.claim_added_voice(p_attempt uuid, p_fresh text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_voice text;
  v_name text;
  v_free text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_added_voice'));
  SELECT status, output_payload->>'voice_id', input_payload->>'name' INTO v_status, v_voice, v_name
    FROM public.operations WHERE id = p_attempt AND operation_type = 'voice_add';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing');
  END IF;
  IF v_status = 'completed' AND v_voice IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'claimed', 'voice_id', v_voice);
  END IF;
  IF v_status NOT IN ('running', 'submission_uncertain') THEN
    RETURN jsonb_build_object('outcome', 'changed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operations
    WHERE operation_type = 'voice_add' AND status = 'running' AND id <> p_attempt
      AND input_payload->>'name' = v_name AND submitted_at > now() - interval '10 minutes'
  ) THEN
    RETURN jsonb_build_object('outcome', 'pending');
  END IF;
  SELECT array_agg(DISTINCT candidate) INTO v_free
    FROM unnest(p_fresh) AS candidate
    WHERE NOT EXISTS (
      SELECT 1 FROM public.operations
      WHERE operation_type = 'voice_add' AND status = 'completed' AND output_payload->>'voice_id' = candidate
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.brand_voices WHERE provider = 'elevenlabs' AND provider_voice_id = candidate
    );
  IF v_free IS NULL THEN
    RETURN jsonb_build_object('outcome', 'pending');
  END IF;
  IF cardinality(v_free) > 1 THEN
    RETURN jsonb_build_object('outcome', 'many');
  END IF;
  UPDATE public.operations
    SET status = 'completed', output_payload = jsonb_build_object('voice_id', v_free[1]),
        completed_at = now(), error_code = NULL, error_message = NULL, failed_at = NULL
    WHERE id = p_attempt;
  RETURN jsonb_build_object('outcome', 'claimed', 'voice_id', v_free[1]);
END $$;
REVOKE ALL ON FUNCTION public.claim_added_voice(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_added_voice(uuid, text[]) TO service_role;

-- An addition ElevenLabs answered is recorded with the voice it answered with,
-- taking turns with claims (claim_added_voice). Server only.
CREATE OR REPLACE FUNCTION public.record_added_voice(p_attempt uuid, p_voice text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_added_voice'));
  UPDATE public.operations
    SET status = 'completed', output_payload = jsonb_build_object('voice_id', p_voice),
        completed_at = now(), error_code = NULL, error_message = NULL, failed_at = NULL
    WHERE id = p_attempt AND operation_type = 'voice_add';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.record_added_voice(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_added_voice(uuid, text) TO service_role;

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

-- Files the server makes (a take's audio, a music track it imports or makes,
-- a rendered edit) go to set places in the output bucket, and the server adds
-- each one's library record once the file is there, finding it again by that
-- place. Members add records for their own uploads only, never in the output
-- bucket, and can't point a record at another file or give it another id, so
-- nobody can take a place the server is about to fill (which would leave
-- billed work looking unfinished) or pass one record off as another. The
-- server is unaffected.
DROP POLICY IF EXISTS "members create assets" ON public.assets;
CREATE POLICY "members create assets" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND storage_bucket <> 'generated-assets');
CREATE OR REPLACE FUNCTION public.keep_asset_location() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'A library record keeps its id.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
      RAISE EXCEPTION 'A library record can''t be pointed at another file.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assets_keep_location ON public.assets;
CREATE TRIGGER assets_keep_location BEFORE UPDATE OF id, storage_bucket, storage_path ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.keep_asset_location();

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
