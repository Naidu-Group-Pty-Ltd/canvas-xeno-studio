-- ============ CREATIVE STUDIO: COMPOSITIONS, MOTION GRAPHICS AS CODE (additive, re-runnable) ============
-- A composition is code-driven motion graphics on the Editor's picture track:
-- a page in a brand's colours and type, and a pure function of time that says
-- what every element looks like at any moment (see src/lib/compositions). The
-- app works out every drawing's changes and the media worker draws them in
-- Chromium as a camera would (up to twice the frame's size, up to eight
-- drawings a frame over a shutter), keeping the frames losslessly beside a
-- playable copy. This keeps what was drawn, so nothing is drawn twice:
--
--   composition_renders: one per composition as drawn, keyed by a hash of
--   everything that decides its frames (its page, its track, its images and
--   fonts, its size, rate and drawing settings). The Editor's clip plays the
--   playable copy (a library video); an edit's render uses the lossless master.
--
--   composition_stretches: a long composition is drawn in stretches of frames,
--   side by side on as many media workers as there are, then joined frame for
--   frame. Each stretch is keyed by a hash of what decides its own frames, so
--   a change redraws only the stretches it touches.
--
-- And a brand kit keeps its demo record: the one fictional set of people,
-- records and figures every product screen in its compositions reads, so a
-- reel never shows a real client and a rename is one edit.
--
-- Members read renders and stretches; only the server writes them. The app
-- works before this is applied: making a composition says it needs this update.

CREATE TABLE IF NOT EXISTS public.composition_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 of the composition as drawn (hex): the same composition is drawn once.
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  template text NOT NULL CHECK (char_length(template) BETWEEN 1 AND 60),
  template_version integer NOT NULL CHECK (template_version >= 1),
  -- {template, version, params, duration}: see compositionSpecSchema.
  spec jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  brand_kit_id uuid REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  quality text NOT NULL CHECK (quality IN ('draft', 'final')),
  -- {scale, drawings, shutter, reuse}: see renderSettingsSchema.
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  width integer NOT NULL CHECK (width BETWEEN 64 AND 3840),
  height integer NOT NULL CHECK (height BETWEEN 64 AND 3840),
  fps integer NOT NULL CHECK (fps IN (24, 25, 30, 60)),
  frames integer NOT NULL CHECK (frames >= 1),
  -- Drawings it needs, and those that change something (the rest are reused).
  drawings integer NOT NULL DEFAULT 0,
  changing integer NOT NULL DEFAULT 0,
  -- Draws with WebGL: sent to a media worker with a GPU where there is one.
  webgl boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'drawing', 'joining', 'completed', 'failed')),
  stage text,
  progress real NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  priority text NOT NULL DEFAULT 'final' CHECK (priority IN ('draft', 'final')),
  -- The bundle the media worker draws from, and what it made.
  bundle_bucket text,
  bundle_path text,
  master_bucket text,
  master_path text,
  poster_path text,
  proxy_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  -- [{from, to, hash, stretch_id}] in frame order, when drawn in stretches.
  stretches jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stretches) = 'array'),
  -- The final join (or the one whole render), once sent.
  media_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  -- What the drawing cost, as the media worker measured it (for estimates).
  seconds_per_drawing numeric,
  render_seconds numeric,
  missing_fields text[] NOT NULL DEFAULT '{}',
  error_code text,
  error_message text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS composition_renders_status_idx
  ON public.composition_renders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS composition_renders_template_idx
  ON public.composition_renders (template, completed_at DESC);

CREATE TABLE IF NOT EXISTS public.composition_stretches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 of what decides this stretch's frames (hex): the same stretch is drawn once.
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  from_frame integer NOT NULL CHECK (from_frame >= 0),
  to_frame integer NOT NULL CHECK (to_frame > from_frame),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'drawing', 'completed', 'failed')),
  progress real NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  master_bucket text,
  master_path text,
  media_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  -- The render that first asked for it.
  render_id uuid REFERENCES public.composition_renders(id) ON DELETE SET NULL,
  seconds_per_drawing numeric,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS composition_stretches_task_idx ON public.composition_stretches (media_task_id);

REVOKE ALL ON public.composition_renders, public.composition_stretches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.composition_renders, public.composition_stretches TO authenticated;
GRANT ALL ON public.composition_renders, public.composition_stretches TO service_role;
ALTER TABLE public.composition_renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composition_stretches ENABLE ROW LEVEL SECURITY;

-- Compositions are shared team work, like edits: any active member sees them.
DROP POLICY IF EXISTS "members read composition renders" ON public.composition_renders;
CREATE POLICY "members read composition renders" ON public.composition_renders FOR SELECT TO authenticated
  USING (public.is_active_member());
DROP POLICY IF EXISTS "members read composition stretches" ON public.composition_stretches;
CREATE POLICY "members read composition stretches" ON public.composition_stretches FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP TRIGGER IF EXISTS composition_renders_updated ON public.composition_renders;
CREATE TRIGGER composition_renders_updated BEFORE UPDATE ON public.composition_renders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS composition_stretches_updated ON public.composition_stretches;
CREATE TRIGGER composition_stretches_updated BEFORE UPDATE ON public.composition_stretches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.brand_kits
  -- {label, entities[{key, label, fields[{key, label, value}]}], lists[{key, label, columns[], rows[][]}]}:
  -- see src/lib/compositions/demo.ts. Null: the studio's own fictional record.
  ADD COLUMN IF NOT EXISTS demo_record jsonb
    CHECK (demo_record IS NULL OR jsonb_typeof(demo_record) = 'object');
