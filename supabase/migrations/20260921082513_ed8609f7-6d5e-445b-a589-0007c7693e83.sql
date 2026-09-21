CREATE OR REPLACE FUNCTION public.__patch_param_field(schema jsonb, fkey text, patch jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(schema, '{fields}', (
    SELECT jsonb_agg(CASE WHEN f->>'key' = fkey THEN f || patch ELSE f END ORDER BY ord)
    FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS t(f, ord)
  ));
$$;

CREATE OR REPLACE FUNCTION public.__require_input(caps jsonb, param text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(caps, '{inputs}', (
    SELECT jsonb_agg(CASE WHEN i->>'param' = param THEN i || '{"required": true}'::jsonb ELSE i END ORDER BY ord)
    FROM jsonb_array_elements(caps->'inputs') WITH ORDINALITY AS t(i, ord)
  ));
$$;

-- Marketing Studio: provider rejects quality "auto".
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'quality',
  '{"options": ["low","medium","high"], "default": "medium"}'::jsonb)
WHERE model_path = 'marketing-studio/image';

-- Kling 3.0 Standard: sound is an on/off string, not a boolean.
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'sound',
  '{"type": "segmented", "options": ["on","off"], "default": "off"}'::jsonb)
WHERE model_path IN ('kling-video/v3.0/std/text-to-video', 'kling-video/v3.0/std/image-to-video');

-- LTX 2.5: fixed duration set, no square aspect ratio.
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(
      public.__patch_param_field(parameter_schema, 'duration',
        '{"type": "segmented", "options": [6,8,10], "default": 6, "max": null, "min": null, "step": null}'::jsonb),
      'aspect_ratio', '{"options": ["16:9","9:16"], "default": "16:9"}'::jsonb)
WHERE model_path IN ('lightricks/ltx-2.5/text-to-video/fast', 'lightricks/ltx-2.5/text-to-video/pro');

-- LTX 2.5 Pro has no 4K tier; Fast keeps it.
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'resolution',
  '{"options": ["720p","1080p"], "default": "1080p"}'::jsonb)
WHERE model_path = 'lightricks/ltx-2.5/text-to-video/pro';

UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'resolution',
  '{"options": ["2K"], "default": "2K"}'::jsonb)
WHERE model_path = 'minimax/h3/text-to-video';

UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'quality',
  '{"options": ["low","medium"], "default": "low"}'::jsonb)
WHERE model_path = 'xai/grok-imagine-image-2.0';

UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'resolution',
  '{"options": ["1k"], "default": "1k"}'::jsonb)
WHERE model_path = 'recraft/v4.1/utility/text-to-image';

-- Genjutsu: 480p/720p only, and the reference image is mandatory.
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'resolution',
      '{"options": ["480p","720p"], "default": "480p"}'::jsonb),
    capabilities = public.__require_input(capabilities, 'image_urls')
WHERE model_path IN ('higgsfiled/genjutsu/motion-transfer/v1.0', 'higgsfiled/genjutsu/object-swap/v1.0');

-- Seedance reference-to-video requires an audio reference.
UPDATE public.model_registry
SET capabilities = public.__require_input(capabilities, 'audio_urls')
WHERE model_path = 'bytedance/seedance-2.5/reference-to-video';

-- Kling Motion Control Pro: correct the sound field and park the route until the
-- provider's estimate endpoint stops returning a server error for it.
UPDATE public.model_registry
SET parameter_schema = public.__patch_param_field(parameter_schema, 'keep_original_sound',
      '{"type": "segmented", "options": ["yes","no"], "default": "no"}'::jsonb),
    is_active = false,
    documentation_status = 'unverified'
WHERE model_path = 'kling-video/motion-control/pro';

DROP FUNCTION public.__patch_param_field(jsonb, text, jsonb);
DROP FUNCTION public.__require_input(jsonb, text);