-- ============ CREATIVE STUDIO: DESIGN SYSTEMS READ FROM CODE (additive, re-runnable) ============
-- A brand's design system can be imported from its source code as well as from
-- its website or guidelines: the GitHub repositories it is built in, read
-- together (the first is the brand's own source, the others build on it). The
-- server lists each repository's files at one commit and reads its styling code
-- as text, never running it: stylesheets, Tailwind and shadcn configs, design
-- token JSON, theme and entry modules. It keeps what it read on the import:
--   every colour, with the tokens that name it and the file and line each is
--   declared on;
--   the typefaces and how each is loaded;
--   the radius, shadow, motion and gradient scales;
--   where the repositories disagree.
-- See CodeDesignSystem in src/lib/brand/scan-code.ts. The review offers it as a
-- stylesheet, tokens.css, each value naming where it is declared.
--
-- Members read it like the rest of the import; only the server writes it. The
-- app works before this is applied: importing from code says it needs it.

ALTER TABLE public.brand_imports DROP CONSTRAINT IF EXISTS brand_imports_kind_check;
ALTER TABLE public.brand_imports
  ADD CONSTRAINT brand_imports_kind_check CHECK (kind IN ('url', 'document', 'repos'));

-- The design system read from the code, with each value's repository, file and line.
ALTER TABLE public.brand_imports
  ADD COLUMN IF NOT EXISTS code jsonb CHECK (code IS NULL OR jsonb_typeof(code) = 'object');
