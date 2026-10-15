-- ============ CREATIVE STUDIO: SOUL ID TRAININGS LOG (additive, re-runnable) ============
-- Every Soul ID training the studio asks Higgsfield for, one row per request
-- (the request key the character's training was started under), so Usage can
-- show them. Higgsfield bills each training to the studio's account but
-- doesn't quote its price, so they are counted, not priced. A character keeps
-- only its latest training; this keeps them all.
--
-- Members read it in the studio; only the server writes it. Trainings work as
-- before without it: until it is applied, Usage just has none to show.

CREATE TABLE IF NOT EXISTS public.soul_id_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The character's request key for this training (one row per request).
  request_key text NOT NULL UNIQUE CHECK (char_length(request_key) <= 64),
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  -- Its name then, so the row reads the same after a rename.
  character_name text NOT NULL DEFAULT '' CHECK (char_length(character_name) <= 80),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  model_version text NOT NULL CHECK (model_version IN ('v1', 'v2', 'cinema')),
  image_count integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  -- As the character's soul_status for it: submitting, training, ready,
  -- failed, or uncertain (Higgsfield's answer was unclear).
  status text NOT NULL DEFAULT 'submitting'
    CHECK (status IN ('submitting', 'training', 'ready', 'failed', 'uncertain')),
  -- When the request went to Higgsfield: only a training sent can have been billed.
  sent_at timestamptz,
  training_id text CHECK (char_length(training_id) <= 100),
  error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  -- When it last came to an end (ready, failed, or an unclear answer).
  settled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soul_id_trainings_requested_idx ON public.soul_id_trainings (requested_at DESC);
CREATE INDEX IF NOT EXISTS soul_id_trainings_character_idx ON public.soul_id_trainings (character_id);

DROP TRIGGER IF EXISTS soul_id_trainings_set_updated_at ON public.soul_id_trainings;
CREATE TRIGGER soul_id_trainings_set_updated_at BEFORE UPDATE ON public.soul_id_trainings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Access: members read; the server writes ----------

REVOKE ALL ON public.soul_id_trainings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.soul_id_trainings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.soul_id_trainings TO service_role;

ALTER TABLE public.soul_id_trainings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read soul id trainings" ON public.soul_id_trainings;
CREATE POLICY "members read soul id trainings" ON public.soul_id_trainings FOR SELECT TO authenticated
  USING (public.is_active_member());
