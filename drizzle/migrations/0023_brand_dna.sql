-- ============ CREATIVE STUDIO: BRAND DNA (additive, re-runnable) ============
-- A brand kit keeps its DNA: what kind of brand it is (SaaS and software, a
-- product, a personal brand or creator, UGC-led, services, a local business,
-- coaching and education), who it sells to, its archetype, what it is and why
-- it rather than another, the themes its content comes back to, the moments
-- buyers think of it, what it can prove, its distinctive assets, who fronts
-- its content, where it publishes, what its content is for now, and the
-- content formulas it works with (ids from the app's formula library).
--
-- The formulas themselves live in the app (src/lib/brand/formula-library.ts),
-- each with the research it rests on; a brand's DNA ranks them, and the
-- Director, long videos, the Supercomputer and the studio API write to them.
--
-- Members read it with the kit; only the server writes it. The app works
-- before this is applied: kits read with no DNA, and saving one says it needs
-- this update.

ALTER TABLE public.brand_kits
  -- {type, alsoTypes[], market, archetype, archetypeAlso, category, job,
  -- difference, pillars[{name, about}], moments[], proof[], assets[], faces[],
  -- channels[], goal, formulas[]}: see src/lib/brand/dna.ts.
  ADD COLUMN IF NOT EXISTS dna jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(dna) = 'object');
