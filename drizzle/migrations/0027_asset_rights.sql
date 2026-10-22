-- ============ CREATIVE STUDIO: A LICENCE AND CREDITS LEDGER (additive, re-runnable) ============
-- Every file the studio uses carries where it came from, its licence and its
-- status for public use (cleared, to confirm, not cleared), with the credit
-- line owed where there is one. Reel 1's music licence was unconfirmed and its
-- map data owed GeoNames a credit, and both were recorded only in prose.
--
-- Until a person records a file's rights they are worked out (see
-- src/lib/rights/rights.ts): music from the library takes its track's licence
-- (the music library stays the record of music; nothing is copied from it),
-- what the studio made is under its provider's terms, what it rendered or cut
-- follows what it was made from, and uploads and API imports are to confirm.
-- asset_rights holds what a person records instead, with who set it and when,
-- and who confirmed it (cleared or not cleared) and when. Members read it;
-- only the server writes it. For a music track only its status and notes are
-- kept here: its licence and credit stay the music library's.
--
-- A render can be for public use (sequence_renders.public_use): it is held,
-- never started, until every file it uses is cleared or someone confirms the
-- exceptions, recorded with who and when (rights_check). Every render's credits
-- travel with it, on its media task and then on the rendered file.
--
-- The app works before this is applied: rights are worked out, recording one
-- says it needs this update, and so does a render for public use.

CREATE TABLE IF NOT EXISTS public.asset_rights (
  asset_id uuid PRIMARY KEY REFERENCES public.assets(id) ON DELETE CASCADE,
  -- Null: as worked out.
  source text CHECK (source IS NULL OR char_length(source) BETWEEN 1 AND 300),
  licence text CHECK (licence IS NULL OR char_length(licence) BETWEEN 1 AND 300),
  licence_url text CHECK (licence_url IS NULL OR char_length(licence_url) <= 500),
  status text NOT NULL CHECK (status IN ('cleared', 'to_confirm', 'not_cleared')),
  credit_line text CHECK (credit_line IS NULL OR char_length(credit_line) <= 1000),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Who decided it (cleared, or not cleared) and when; null while it is to confirm.
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.asset_rights FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.asset_rights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_rights TO service_role;
ALTER TABLE public.asset_rights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read asset rights" ON public.asset_rights;
CREATE POLICY "members read asset rights" ON public.asset_rights FOR SELECT TO authenticated
  USING (public.is_active_member());

-- A render for public use, and what was confirmed for it: the files that
-- weren't cleared, and who confirmed them as exceptions and when.
ALTER TABLE public.sequence_renders ADD COLUMN IF NOT EXISTS public_use boolean NOT NULL DEFAULT false;
ALTER TABLE public.sequence_renders
  ADD COLUMN IF NOT EXISTS rights_check jsonb
  CHECK (rights_check IS NULL OR jsonb_typeof(rights_check) = 'object');
