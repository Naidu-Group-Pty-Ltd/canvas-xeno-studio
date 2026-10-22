-- ============ CREATIVE STUDIO: RENDER QUALITY AND REVIEW SHEETS (additive, re-runnable) ============
-- Every Editor render is measured by the media service against its own
-- lossless reference (feature render_quality; media-worker/src/quality.js):
-- SSIM and PSNR frame by frame, the edge contrast kept, CIEDE2000 on flat
-- fields and on the brand kit's colours, banding, each caption and cut on its
-- frames, the voiceover's sync and the loudness, each judged a pass or a flag.
-- The report, a few kilobytes, is kept on the render (see src/lib/edit/quality.ts).
--
-- A render can also have a review sheet (feature review_sheet): every shot
-- half a second in and on its last frame, labelled, as one picture in the
-- library. The render keeps the media task that makes it; the sheet is that
-- task's result.
--
-- Members read both with the render; only the server writes them. The app
-- works before this is applied: a render's report is still kept in its
-- video's library record, and making a review sheet says it needs this.

ALTER TABLE public.sequence_renders
  ADD COLUMN IF NOT EXISTS quality jsonb CHECK (quality IS NULL OR jsonb_typeof(quality) = 'object');

ALTER TABLE public.sequence_renders
  ADD COLUMN IF NOT EXISTS review_sheet_task_id uuid REFERENCES public.media_tasks(id) ON DELETE SET NULL;
