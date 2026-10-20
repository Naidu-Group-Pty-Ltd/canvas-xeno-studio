-- ============ CREATIVE STUDIO: SAY WHICH MODELS ARE GPT IMAGE (re-runnable) ============
-- Higgsfield's Marketing Studio 2.5 Flare and 2.5 Sunburst render with OpenAI's
-- GPT Image 2.5 (the image model in ChatGPT), as its Ads Studio notes say of Flare,
-- but their names don't show it. Their "best for" text, which Create shows and the
-- Supercomputer agent reads, now says so, so "use a ChatGPT model" finds them.
-- Only the text changes; the catalogue rebuild keeps it (see scripts/higgsfield).

UPDATE public.model_registry SET recommended_for = CASE operation
    WHEN 'text-to-image' THEN 'GPT Image 2.5 Flare (OpenAI, the ChatGPT image model): fast, premium stills of people, places and products'
    ELSE 'GPT Image 2.5 Flare (OpenAI, the ChatGPT image model): edits and new stills from up to 16 references'
  END
WHERE provider = 'higgsfield' AND model_path = 'marketing-studio/image/flare';

UPDATE public.model_registry SET recommended_for = CASE operation
    WHEN 'text-to-image' THEN 'GPT Image 2.5 Sunburst (OpenAI, the ChatGPT image model): its highest quality, for people, character sheets and campaign stills'
    ELSE 'GPT Image 2.5 Sunburst (OpenAI, the ChatGPT image model): precise edits and new stills from up to 16 references, keeping people the same'
  END
WHERE provider = 'higgsfield' AND model_path = 'marketing-studio/image/sunburst';
