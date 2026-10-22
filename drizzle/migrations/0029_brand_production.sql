-- ============ CREATIVE STUDIO: A BRAND'S PRODUCTION ROLES (additive, re-runnable) ============
-- A brand kit keeps the roles its graphics are drawn in, read from the brand's
-- code and checked by a person on the Brand page:
--   colour: the ground, surface, raised card and glass, the ink and its muted
--   line, the accent, the brand's signature colour, lines, selection, danger;
--   type: display and its italic, body, mono, the eyebrow label;
--   the corners, shadows and blur of a window and a card;
--   motion: the brand's easing curves and durations (move, settle, enter,
--   exit, press), which title overlays take when the kit is applied.
-- Each role keeps the repository, file and line it is declared on, and the
-- values the repositories disagree on are kept with a note saying what
-- production uses and why. See BrandProduction in src/lib/brand/production.ts;
-- the Brand page writes it out as a stylesheet (--brand-* custom properties)
-- and a token sheet, and get_brand_kit returns it.
--
-- Members read it with the kit; only the server writes it. The app works
-- before this is applied: kits read with no production roles, and saving some
-- says it needs this update.

ALTER TABLE public.brand_kits
  -- {scheme, roles{<role>: {kind, value…, from{token, repo, path, line,
  -- scheme, written, alsoIn[], uses}, why}}, decisions[{token, scheme,
  -- values[], chosen, note}], read[{repo, sha}], importId}: see
  -- src/lib/brand/production.ts.
  ADD COLUMN IF NOT EXISTS production jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(production) = 'object');
