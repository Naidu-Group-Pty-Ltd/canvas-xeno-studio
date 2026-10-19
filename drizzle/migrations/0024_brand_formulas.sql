-- ============ CREATIVE STUDIO: A BRAND'S OWN FORMULAS (additive, re-runnable) ============
-- A brand kit keeps the content formulas written for it: proven formulas from
-- the app's library (src/lib/brand/formula-library.ts) rewritten for this
-- brand's audiences, offers, proof, distinctive assets and voice, by a person
-- or the studio's AI. Each keeps the guardrails and sources of the library
-- formulas it was written from. They come first wherever the brand's content
-- is planned: the Director, long videos, the Supercomputer and the studio API.
--
-- Members read them with the kit; only the server writes them. The app works
-- before this is applied: kits read with none, and saving some says it needs
-- this update.

ALTER TABLE public.brand_kits
  -- [{id, name, origin, summary, purpose, goals[], fit, markets[], channels[],
  -- faces[], seconds {min, ideal, max}, shapes[], beats[{key, label, share,
  -- job, show, say, edge, from}], rules[], avoid[], guardrails[], why, grade,
  -- sources[], own {basedOn[], audience, cadence}}]: see
  -- src/lib/brand/own-formulas.ts.
  ADD COLUMN IF NOT EXISTS formulas jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(formulas) = 'array');
