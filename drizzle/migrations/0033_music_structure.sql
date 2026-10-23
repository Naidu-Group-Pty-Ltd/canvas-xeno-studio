-- ============ CREATIVE STUDIO: MUSIC STRUCTURE (additive, re-runnable) ============
-- A track's bars and sections, found in the browser from its audio as its
-- tempo and beats are, and kept on the track so they are found once:
--   structure: which beat is one, the downbeats and bar lines, and the
--     sections (the intro, a build, the drop, a breakdown, the re-entry, the
--     outro), each with its loudness against the rest of the track;
--   bar_features: what each bar sounds like (its loudness, six band energies,
--     harmony and rhythm), for fitting music to a length on its bars by
--     repeating or leaving out the bars most like their neighbours.
-- See MusicStructure and BarFeatures in src/lib/music/structure.ts; a newer
-- analysis (its version, in bar_features) finds them again.
--
-- Members read them like the rest of the track (the table's grant covers new
-- columns); only the server writes them. The app works before this is
-- applied: a track's bars and sections are found again each time instead.

ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS structure jsonb
    CHECK (structure IS NULL OR jsonb_typeof(structure) = 'object');
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS bar_features jsonb
    CHECK (bar_features IS NULL OR jsonb_typeof(bar_features) = 'object');
