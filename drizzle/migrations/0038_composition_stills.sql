-- ============ CREATIVE STUDIO: COMPOSITION STILLS (additive, re-runnable) ============
-- A still is a composition drawn as one moment, once, at twice the frame's
-- size, and kept as a library picture: a thumbnail, a cover or a card set in
-- the brand's own type over a stage, never lettered by a model (see
-- docs/compositions.md, "Stills"). It is kept in composition_renders like any
-- drawing, under the hash of everything that decides it, so the same still is
-- never drawn twice; its quality is 'still'.
--
-- The app works before this is applied: drawing a still says it needs this
-- update, and motion graphics draw as they did.

ALTER TABLE public.composition_renders
  DROP CONSTRAINT IF EXISTS composition_renders_quality_check;
ALTER TABLE public.composition_renders
  ADD CONSTRAINT composition_renders_quality_check
  CHECK (quality IN ('draft', 'final', 'still'));
