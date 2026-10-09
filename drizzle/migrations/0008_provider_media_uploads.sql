-- Provider copies of studio media.
--
-- A model that takes images, video or audio can only be quoted (and run) with
-- that media on the provider's side, so the cost estimate shown before
-- generating has to upload it too. This remembers each asset's recent upload
-- so a live estimate that refreshes as settings change, and the generation
-- that follows, reuse one upload instead of sending the file every time.
--
-- Written and read by the server (service role) only; nothing here is exposed
-- to the browser. Re-runnable.

CREATE TABLE IF NOT EXISTS public.provider_media_uploads (
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  provider text NOT NULL,
  -- The stored file the upload was made from; a different file needs a new upload.
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  public_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, provider)
);

ALTER TABLE public.provider_media_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_media_uploads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_media_uploads TO service_role;
