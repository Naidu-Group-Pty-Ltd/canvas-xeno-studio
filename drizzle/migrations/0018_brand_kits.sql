-- ============ CREATIVE STUDIO: BRAND KITS (additive, re-runnable) ============
-- A brand's look, kept once and used everywhere an edit is made: its logo,
-- the background its end card is set on, its fonts (TrueType or OpenType
-- files uploaded under generation-inputs/brand-fonts/), its colours and title
-- style, its tagline, call to action and website, and the names captions must
-- spell right. A kit can be the team's default, or kept for one project.
-- Members read kits; the server writes them (see src/lib/brand.functions.ts).
-- The app works before this is applied: the Editor offers no kit until then.

CREATE TABLE IF NOT EXISTS public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  logo_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  end_card_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- Families for titles, and for subtitles and captions: Inter, or one of `fonts`.
  heading_font text NOT NULL DEFAULT 'Inter' CHECK (char_length(heading_font) BETWEEN 1 AND 80),
  body_font text NOT NULL DEFAULT 'Inter' CHECK (char_length(body_font) BETWEEN 1 AND 80),
  -- [{family, bucket, path}]: each a font file and the family it names itself by.
  fonts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fonts) = 'array' AND jsonb_array_length(fonts) <= 6),
  text_color text NOT NULL DEFAULT '#ffffff' CHECK (text_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text NOT NULL DEFAULT '#2563eb' CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  background_color text NOT NULL DEFAULT '#0b1020' CHECK (background_color ~ '^#[0-9a-fA-F]{6}$'),
  title_backing text NOT NULL DEFAULT 'halo' CHECK (title_backing IN ('outline', 'halo', 'box')),
  uppercase_titles boolean NOT NULL DEFAULT false,
  tagline text CHECK (tagline IS NULL OR char_length(tagline) <= 160),
  call_to_action text CHECK (call_to_action IS NULL OR char_length(call_to_action) <= 60),
  website text CHECK (website IS NULL OR char_length(website) <= 120),
  -- The brand dictionary: names captions spell exactly so.
  terms text[] NOT NULL DEFAULT '{}' CHECK (cardinality(terms) <= 50),
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A kit kept for one project can't be the whole studio's default.
  CONSTRAINT brand_kits_default_for_any_project CHECK (NOT is_default OR project_id IS NULL)
);
CREATE INDEX IF NOT EXISTS brand_kits_recent_idx ON public.brand_kits (updated_at DESC);
CREATE INDEX IF NOT EXISTS brand_kits_project_idx ON public.brand_kits (project_id) WHERE project_id IS NOT NULL;
-- One default kit, and one kit per project.
CREATE UNIQUE INDEX IF NOT EXISTS brand_kits_one_default ON public.brand_kits (is_default)
  WHERE is_default AND NOT is_archived;
CREATE UNIQUE INDEX IF NOT EXISTS brand_kits_one_per_project ON public.brand_kits (project_id)
  WHERE project_id IS NOT NULL AND NOT is_archived;

DROP TRIGGER IF EXISTS brand_kits_updated ON public.brand_kits;
CREATE TRIGGER brand_kits_updated BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Makes a kit the default in one statement (the one before stops being it).
CREATE OR REPLACE FUNCTION public.set_default_brand_kit(_kit_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.brand_kits SET is_default = false WHERE is_default AND id <> _kit_id;
  UPDATE public.brand_kits SET is_default = true
    WHERE id = _kit_id AND project_id IS NULL AND NOT is_archived;
END $$;
REVOKE ALL ON FUNCTION public.set_default_brand_kit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_brand_kit(uuid) TO service_role;

REVOKE ALL ON public.brand_kits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.brand_kits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO service_role;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read brand kits" ON public.brand_kits;
CREATE POLICY "members read brand kits" ON public.brand_kits FOR SELECT TO authenticated
  USING (public.is_active_member());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'brand_kits') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_kits;
    END IF;
  END IF;
END $$;
