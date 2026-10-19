-- ============ CREATIVE STUDIO: BRAND DESIGN SYSTEMS (additive, re-runnable) ============
-- A brand kit grows into the brand's design system: its whole palette (each
-- colour with its role), its design language (typefaces, the look of its
-- imagery, its voice, what it does and never does, and the line every
-- generation carries), the images that show its look (used as style
-- references), and where it was imported from.
--
-- A design system is imported from the brand's website or its guidelines
-- (a PDF): the server scans the site's pages, styles and fonts (or reads the
-- document's text and page pictures), stages its logo and imagery, and the
-- studio's AI reads it all into a proposal a person reviews before it becomes
-- (or updates) a kit. Each import is kept in brand_imports, with what was
-- found and what was proposed.
--
-- Members read both; only the server writes them. The app works before this
-- is applied: kits keep their colours and fonts, and importing says it needs
-- this update.

ALTER TABLE public.brand_kits
  -- [{hex, name, role, usage}]: role is primary, secondary, accent,
  -- background, surface, text, muted, highlight or other.
  ADD COLUMN IF NOT EXISTS palette jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(palette) = 'array' AND jsonb_array_length(palette) <= 24),
  -- {summary, audience, personality[], typography[], visual{...}, voice{...},
  -- logo{...}, dos[], donts[], promptStyle, avoid}: see src/lib/brand/design.ts.
  ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(design) = 'object'),
  -- {kind (url|document), url, title, import_id, imported_at}.
  ADD COLUMN IF NOT EXISTS source jsonb
    CHECK (source IS NULL OR jsonb_typeof(source) = 'object'),
  -- Library images that show the brand's look, used as style references.
  ADD COLUMN IF NOT EXISTS reference_asset_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
    CHECK (cardinality(reference_asset_ids) <= 12);

-- The brand a long video is made in, as it was when the video started: the
-- kit, and the lines its clips, keyframes and words carry (see
-- src/lib/brand/design.ts brandSnapshot). Set only when a brand is chosen.
ALTER TABLE public.long_videos
  ADD COLUMN IF NOT EXISTS brand jsonb CHECK (brand IS NULL OR jsonb_typeof(brand) = 'object');

CREATE TABLE IF NOT EXISTS public.brand_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('url', 'document')),
  -- The page scanned, or the document's name.
  source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2000),
  source_title text CHECK (source_title IS NULL OR char_length(source_title) <= 300),
  -- scanning: reading the site or document; ready: a proposal to review;
  -- applied: made into (or merged into) a kit; failed: see error.
  status text NOT NULL DEFAULT 'scanning'
    CHECK (status IN ('scanning', 'ready', 'applied', 'failed')),
  -- What it is doing now, in words, while scanning.
  stage text CHECK (stage IS NULL OR char_length(stage) <= 200),
  -- What the scan found: colours, fonts, logo and image candidates, copy.
  signals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(signals) = 'object'),
  -- The design system proposed from it (see src/lib/brand/design.ts).
  proposal jsonb CHECK (proposal IS NULL OR jsonb_typeof(proposal) = 'object'),
  -- Files it staged under generation-inputs/brand-imports/<id>/ (logos,
  -- imagery, page pictures) and font files under brand-fonts/.
  staged jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(staged) = 'array'),
  error text CHECK (error IS NULL OR char_length(error) <= 1000),
  -- The kit it was applied to.
  brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_imports_recent_idx ON public.brand_imports (created_at DESC);
CREATE INDEX IF NOT EXISTS brand_imports_kit_idx ON public.brand_imports (brand_kit_id)
  WHERE brand_kit_id IS NOT NULL;

DROP TRIGGER IF EXISTS brand_imports_updated ON public.brand_imports;
CREATE TRIGGER brand_imports_updated BEFORE UPDATE ON public.brand_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.brand_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.brand_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_imports TO service_role;
ALTER TABLE public.brand_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read brand imports" ON public.brand_imports;
CREATE POLICY "members read brand imports" ON public.brand_imports FOR SELECT TO authenticated
  USING (public.is_active_member());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'brand_imports') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_imports;
    END IF;
  END IF;
END $$;
