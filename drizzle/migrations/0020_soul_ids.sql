-- ============ CREATIVE STUDIO: SOUL IDS BY VERSION, TRAINING SETS, LIKENESS (additive, re-runnable) ============
-- A character can have a Soul ID for each Soul model at once (Soul 2 for
-- images, Soul Cinema for film-look stills, Soul Standard), each kept here
-- with where it came from (trained by the studio, an unclear training's id
-- found at Higgsfield, or imported from the account's list), the images it
-- was trained on, and how alike its images come out (the likeness proof: a
-- few Soul images scored against the training images, then approved by a
-- person). One Soul ID per character and version is in use (is_active); an
-- older one stays recorded, retired.
--
-- The character's own soul_* columns still follow its latest training (one
-- at a time), and soul_reference_id / soul_model_version still name the Soul
-- ID used last, so everything that reads them keeps working.
--
-- Members read it in the studio; only the server writes it.

CREATE TABLE IF NOT EXISTS public.character_souls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  model_version text NOT NULL CHECK (model_version IN ('v1', 'v2', 'cinema')),
  -- Higgsfield's id for it (sent as custom_reference_id).
  reference_id text NOT NULL CHECK (char_length(btrim(reference_id)) BETWEEN 1 AND 100),
  -- trained: by the studio; attached: an unclear training's id found at
  -- Higgsfield; imported: from the account's own list.
  source text NOT NULL DEFAULT 'trained' CHECK (source IN ('trained', 'attached', 'imported')),
  is_active boolean NOT NULL DEFAULT true,
  -- The training it came from (soul_id_trainings.request_key), when the studio trained it.
  request_key text CHECK (char_length(request_key) <= 64),
  image_count integer CHECK (image_count >= 0),
  -- The images it was trained on, as they were in the library then.
  training_asset_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  -- Higgsfield's small picture of the likeness, while its link lasts.
  thumbnail_url text CHECK (char_length(thumbnail_url) <= 2000),
  -- The likeness proof: {score (0-10), verdict (strong|fair|weak), summary,
  -- asset_ids (the Soul images scored), per_image [...], model, checked_at}.
  likeness jsonb CHECK (likeness IS NULL OR jsonb_typeof(likeness) = 'object'),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ready_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, model_version, reference_id)
);
-- One Soul ID in use per character and Soul model.
CREATE UNIQUE INDEX IF NOT EXISTS character_souls_active_idx
  ON public.character_souls (character_id, model_version) WHERE is_active;
CREATE INDEX IF NOT EXISTS character_souls_reference_idx ON public.character_souls (reference_id);

DROP TRIGGER IF EXISTS character_souls_set_updated_at ON public.character_souls;
CREATE TRIGGER character_souls_set_updated_at BEFORE UPDATE ON public.character_souls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The images the latest training is (or was) trained on, so the Soul ID it
-- makes records them; and the same on each training's log row.
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS soul_training_asset_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.soul_id_trainings
  ADD COLUMN IF NOT EXISTS asset_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Each character's Soul ID in use becomes its Soul ID for that version.
INSERT INTO public.character_souls
  (character_id, model_version, reference_id, source, is_active, request_key, image_count, created_by, ready_at)
SELECT c.id, c.soul_model_version, c.soul_reference_id, 'trained', true,
       CASE WHEN c.soul_status = 'ready' AND c.soul_training_id = c.soul_reference_id THEN c.soul_request_key END,
       c.soul_image_count, c.created_by, COALESCE(c.soul_ready_at, c.updated_at)
FROM public.characters c
WHERE c.soul_reference_id IS NOT NULL AND c.soul_model_version IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.character_souls s
    WHERE s.character_id = c.id AND s.model_version = c.soul_model_version AND s.is_active
  )
ON CONFLICT (character_id, model_version, reference_id) DO NOTHING;

-- ---------- Access: members read; the server writes ----------

REVOKE ALL ON public.character_souls FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.character_souls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_souls TO service_role;

ALTER TABLE public.character_souls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read character souls" ON public.character_souls;
CREATE POLICY "members read character souls" ON public.character_souls FOR SELECT TO authenticated
  USING (public.is_active_member());

-- Everyone's view of a character refreshes when its Soul IDs change.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'character_souls'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.character_souls;
  END IF;
END $$;
