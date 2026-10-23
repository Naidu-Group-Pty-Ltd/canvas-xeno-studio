-- ============ CREATIVE STUDIO: REFERENCE SCREENSHOTS KEPT PRIVATE (additive, re-runnable) ============
-- A screenshot supplied as a reference (a client's portal, say) can carry real
-- people's names, emails, phone numbers and addresses, and is fit only to show
-- how a screen is laid out. On import it can be:
--   redacted: its text read with where each piece is (the studio's AI), what
--   is private found (emails and phone numbers by their pattern, names and
--   addresses by the AI), the boxes checked by a person, and those boxes
--   blurred in a copy by the media worker (its redact_image). The original is
--   never in the library: while it is checked it sits in its uploader's folder
--   of the private reference-originals bucket, and once the copy is made it is
--   deleted, unless someone asked to keep it; then it moves to the bucket's
--   kept/ folder, which only admins can open. The text read is never kept,
--   only boxes with labels that hide most of what they cover;
--   layout only: no generation and no edit may place it in a frame. The server
--   refuses it as a generation's input (and wherever a file goes to the
--   provider), on an edit's timeline, in a render and as the source of a copy
--   (see src/lib/media/layout-only.server.ts).
-- The mark is kept apart from the file, and from its licence: anyone may mark
-- a picture layout only, and only an admin may lift the mark. Only the server
-- writes either table; members read the marks (the library shows them), and a
-- redaction only who made it, and admins. The app works before this is
-- applied: importing a screenshot this way says it needs it, and nothing is
-- held as layout only.

CREATE TABLE IF NOT EXISTS public.reference_redactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- uploading, reading, review (a person checks the boxes), applying, then completed;
  -- failed (applied again from review) or cancelled (the original deleted).
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'reading', 'review', 'applying', 'completed', 'failed', 'cancelled')),
  original_bucket text NOT NULL DEFAULT 'reference-originals',
  original_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  file_size bigint CHECK (file_size IS NULL OR file_size > 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  -- The boxes to blur, as shares of the picture: [{id, x, y, w, h, kind, source, label}].
  boxes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(boxes) = 'array'),
  -- What the reading found (how many of each kind, the model, when), or why it couldn't read.
  reading jsonb CHECK (reading IS NULL OR jsonb_typeof(reading) = 'object'),
  -- The copy is marked layout only unless a person said otherwise.
  layout_only boolean NOT NULL DEFAULT true,
  -- Keep the original (admins only) once the copy is made, rather than delete it.
  keep_original boolean NOT NULL DEFAULT false,
  original_removed_at timestamptz,
  -- How many times the boxes were applied: the copy's task is keyed by it.
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  media_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL,
  redacted_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  -- A script's own key for its import (import_image's clientRequestId).
  client_request_id text CHECK (client_request_id IS NULL OR char_length(client_request_id) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS reference_redactions_request_idx
  ON public.reference_redactions (created_by, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reference_redactions_creator_idx
  ON public.reference_redactions (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS reference_redactions_open_idx
  ON public.reference_redactions (status, updated_at) WHERE status IN ('uploading', 'reading', 'review', 'applying');

DROP TRIGGER IF EXISTS reference_redactions_updated ON public.reference_redactions;
CREATE TRIGGER reference_redactions_updated BEFORE UPDATE ON public.reference_redactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.reference_redactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reference_redactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reference_redactions TO service_role;
ALTER TABLE public.reference_redactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read their own redactions" ON public.reference_redactions;
CREATE POLICY "members read their own redactions" ON public.reference_redactions FOR SELECT TO authenticated
  USING (public.is_active_member() AND (created_by = auth.uid() OR public.is_admin()));

-- A library file's privacy mark: one row per file that has one.
CREATE TABLE IF NOT EXISTS public.asset_privacy (
  asset_id uuid PRIMARY KEY REFERENCES public.assets(id) ON DELETE CASCADE,
  -- No generation or edit may place it in a frame.
  layout_only boolean NOT NULL DEFAULT false,
  -- The redaction the file is the copy of, and how many areas were blurred in it.
  redaction_id uuid REFERENCES public.reference_redactions(id) ON DELETE SET NULL,
  redacted_areas integer CHECK (redacted_areas IS NULL OR redacted_areas >= 0),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  lifted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lifted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_privacy_layout_only_idx ON public.asset_privacy (asset_id) WHERE layout_only;

DROP TRIGGER IF EXISTS asset_privacy_updated ON public.asset_privacy;
CREATE TRIGGER asset_privacy_updated BEFORE UPDATE ON public.asset_privacy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.asset_privacy FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.asset_privacy TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_privacy TO service_role;
ALTER TABLE public.asset_privacy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read privacy marks" ON public.asset_privacy;
CREATE POLICY "members read privacy marks" ON public.asset_privacy FOR SELECT TO authenticated
  USING (public.is_active_member());

-- The originals: a private bucket. A member uploads only into their own folder
-- and reads back only what is there (a screenshot being checked); admins read
-- everything, and a kept original (kept/) only they can.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('reference-originals', 'reference-originals', false)
  ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "reference originals upload own" ON storage.objects;
CREATE POLICY "reference originals upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reference-originals' AND public.is_active_member()
    AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "reference originals read own or admin" ON storage.objects;
CREATE POLICY "reference originals read own or admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reference-originals' AND public.is_active_member()
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
