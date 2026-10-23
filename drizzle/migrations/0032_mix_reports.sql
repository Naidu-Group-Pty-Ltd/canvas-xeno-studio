-- ============ CREATIVE STUDIO: A RENDER'S MIX REPORT (additive, re-runnable) ============
-- Every render says how its sound sits: the voice's margin over the music in
-- the speech band (300 Hz to 4 kHz), section by section (each music item's
-- span; Reel 1 measured 10 to 19 dB by hand), and the measured loudness of the
-- finished mix (integrated LUFS, loudness range, true peak). The media worker
-- measures it after the mix pass (its mix_report; see media-worker/src/
-- mixreport.js) and the render's callback keeps it here, beside the render, so
-- the Render panel and the API's get_render can show it.
--
-- Members read it as they read the rest of the render (the table's grants and
-- policies cover the new column); only the server writes it. The app works
-- before this is applied: the report is still kept with the rendered video's
-- own record, and get_render reads it from there.

ALTER TABLE public.sequence_renders
  ADD COLUMN IF NOT EXISTS mix_report jsonb
    CHECK (mix_report IS NULL OR jsonb_typeof(mix_report) = 'object');
