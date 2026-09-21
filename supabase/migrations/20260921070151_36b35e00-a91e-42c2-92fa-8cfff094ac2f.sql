-- V2 model registry expansion (additive; V1 rows untouched)
INSERT INTO public.model_registry
 (provider, family, model_family, provider_family, display_name, description, model_path, output_type, operation,
  capabilities, parameter_schema, default_parameters, recommended_for, is_active, sort_order,
  capability_tags, documentation_status, max_reference_images, max_reference_videos,
  supports_image_input, supports_video_input, supports_native_audio, supports_seed, supports_edit, supports_extend)
VALUES
-- Cinema Studio 4.0
('higgsfield','Cinema Studio','Cinema Studio','higgsfield','Cinema Studio 4.0','Cinematic video with rich camera and lighting direction.','higgsfield/cinema-studio/4.0','video','cinematic-video',
 '{"cancelable":true,"inputs":[{"role":"reference","type":"image","param":"image_urls","array":true,"max":30}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"duration","type":"slider","label":"Duration (s)","min":4,"max":30,"step":1,"default":5},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["480p","720p"],"default":"720p"},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["16:9","9:16","1:1","4:3","3:4","21:9"],"default":"16:9"},
   {"key":"generate_audio","type":"boolean","label":"Native audio","default":true}
 ]}'::jsonb,
 '{}'::jsonb,'Cinematic campaign film-making',true,5,
 ARRAY['cinematic','camera_control','native_audio'],'verified',30,0,true,false,true,false,false,false),

-- Genjutsu motion transfer
('higgsfield','Genjutsu','Genjutsu','higgsfield','Genjutsu Motion Transfer','Transfer motion from a source video onto new characters or products.','higgsfiled/genjutsu/motion-transfer/v1.0','video','motion-transfer',
 '{"cancelable":true,"inputs":[{"role":"source","type":"video","param":"video_url","required":true,"max":1},{"role":"reference","type":"image","param":"image_urls","array":true,"max":5}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Instruction","maxLength":2000},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["480p","720p","1080p"],"default":"720p"}
 ]}'::jsonb,
 '{}'::jsonb,'Re-cast motion onto a new subject',true,30,
 ARRAY['motion_transfer','consistency'],'verified',5,1,true,true,false,false,true,false),

-- Genjutsu object swap
('higgsfield','Genjutsu','Genjutsu','higgsfield','Genjutsu Object Swap','Replace an object, product or person inside an existing video.','higgsfiled/genjutsu/object-swap/v1.0','video','object-swap',
 '{"cancelable":true,"inputs":[{"role":"source","type":"video","param":"video_url","required":true,"max":1},{"role":"reference","type":"image","param":"image_urls","array":true,"max":5}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Instruction","maxLength":2000},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["480p","720p","1080p"],"default":"720p"}
 ]}'::jsonb,
 '{}'::jsonb,'Product and object replacement in video',true,31,
 ARRAY['object_swap','brand_creative'],'verified',5,1,true,true,false,false,true,false),

-- Seedance video edit
('higgsfield','Seedance','Seedance','higgsfield','Seedance 2.5 Video Edit','Prompt-driven editing of an existing video.','bytedance/seedance-2.5/video-edit','video','video-edit',
 '{"cancelable":true,"inputs":[{"role":"source","type":"video","param":"video_url","required":true,"max":1},{"role":"reference","type":"image","param":"image_urls","array":true,"max":4}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Edit instruction","required":true,"minLength":2,"maxLength":2000},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["480p","720p"],"default":"720p"},
   {"key":"output_format","type":"select","label":"Format","options":["mp4","mov"],"default":"mp4"},
   {"key":"generate_audio","type":"boolean","label":"Native audio","default":true}
 ]}'::jsonb,
 '{}'::jsonb,'Editing shots without regenerating them',true,32,
 ARRAY['video_edit'],'verified',4,1,true,true,true,false,true,false),

-- Kling motion control
('higgsfield','Kling','Kling','higgsfield','Kling Motion Control Pro','Drive a character image with a motion reference video.','kling-video/motion-control/pro','video','motion-control',
 '{"cancelable":true,"inputs":[{"role":"image","type":"image","param":"image_url","required":true,"max":1},{"role":"video","type":"video","param":"video_url","required":true,"max":1}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","maxLength":2000},
   {"key":"keep_original_sound","type":"boolean","label":"Keep original sound","default":false},
   {"key":"character_orientation","type":"segmented","label":"Character orientation","options":["image","video"],"default":"image"}
 ]}'::jsonb,
 '{}'::jsonb,'Animating a character with reference motion',true,33,
 ARRAY['motion_control','consistency'],'verified',1,1,true,true,true,false,false,false),

-- LTX 2.5 fast / pro
('higgsfield','LTX','LTX','higgsfield','LTX 2.5 Fast','Fast high-resolution video with native audio.','lightricks/ltx-2.5/text-to-video/fast','video','text-to-video',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"duration","type":"slider","label":"Duration (s)","min":4,"max":10,"step":1,"default":5},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["720p","1080p","4k"],"default":"1080p"},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["16:9","9:16","1:1"],"default":"16:9"},
   {"key":"generate_audio","type":"boolean","label":"Native audio","default":true},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":0,"max":2147483647}
 ]}'::jsonb,
 '{}'::jsonb,'Fast iteration on video ideas',true,34,
 ARRAY['native_audio','high_resolution_video','camera_control','fast'],'verified',0,0,false,false,true,true,false,false),

('higgsfield','LTX','LTX','higgsfield','LTX 2.5 Pro','Higher-fidelity LTX video generation.','lightricks/ltx-2.5/text-to-video/pro','video','text-to-video',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"duration","type":"slider","label":"Duration (s)","min":4,"max":10,"step":1,"default":5},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["720p","1080p","4k"],"default":"1080p"},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["16:9","9:16","1:1"],"default":"16:9"},
   {"key":"generate_audio","type":"boolean","label":"Native audio","default":true},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":0,"max":2147483647}
 ]}'::jsonb,
 '{}'::jsonb,'Best-quality LTX output',true,35,
 ARRAY['native_audio','high_resolution_video','quality'],'verified',0,0,false,false,true,true,false,false),

-- MiniMax H3
('higgsfield','MiniMax','MiniMax','higgsfield','MiniMax H3','2K text-to-video with strong motion.','minimax/h3/text-to-video','video','text-to-video',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"duration","type":"slider","label":"Duration (s)","min":5,"max":15,"step":1,"default":6},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["720p","1080p","2k"],"default":"1080p"},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["16:9","9:16","1:1"],"default":"16:9"}
 ]}'::jsonb,
 '{}'::jsonb,'Dynamic motion at 2K',true,36,
 ARRAY['motion','high_resolution_video'],'verified',0,0,false,false,false,false,false,false),

-- Qwen Image 3
('higgsfield','Qwen','Qwen','higgsfield','Qwen Image 3','Multilingual text-to-image with strong prompt adherence.','alibaba/qwen-image-3/text-to-image','image','text-to-image',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"negative_prompt","type":"textarea","label":"Negative prompt","advanced":true,"maxLength":2000},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["1:1","16:9","9:16","4:3","3:4"],"default":"1:1"},
   {"key":"prompt_extension","type":"boolean","label":"Prompt extension","default":true},
   {"key":"enable_thinking","type":"boolean","label":"Thinking","advanced":true,"default":false},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":0,"max":2147483647}
 ]}'::jsonb,
 '{}'::jsonb,'Multilingual prompts and precise adherence',true,37,
 ARRAY['multilingual','prompt_adherence'],'verified',0,0,false,false,false,true,false,false),

('higgsfield','Qwen','Qwen','higgsfield','Qwen Image 3 Edit','Reference-driven image editing.','alibaba/qwen-image-3/edit','image','image-edit',
 '{"cancelable":true,"inputs":[{"role":"source","type":"image","param":"image_urls","array":true,"required":true,"max":4}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Edit instruction","required":true,"minLength":2,"maxLength":4000},
   {"key":"negative_prompt","type":"textarea","label":"Negative prompt","advanced":true,"maxLength":2000},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":0,"max":2147483647}
 ]}'::jsonb,
 '{}'::jsonb,'Editing images with ordered references',true,38,
 ARRAY['image_edit','consistency'],'verified',4,0,true,false,false,true,true,false),

-- Grok Imagine
('higgsfield','Grok','Grok','higgsfield','Grok Imagine Image 2.0','Fast image creation and transformation.','xai/grok-imagine-image-2.0','image','text-to-image',
 '{"cancelable":true,"inputs":[{"role":"reference","type":"image","param":"image_urls","array":true,"max":4}]}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["1k","2k"],"default":"1k"},
   {"key":"quality","type":"select","label":"Quality","options":["standard","high"],"default":"standard"},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["1:1","16:9","9:16","4:3","3:4"],"default":"1:1"}
 ]}'::jsonb,
 '{}'::jsonb,'Quick image transformation',true,39,
 ARRAY['fast','image_edit'],'verified',4,0,true,false,false,false,true,false),

-- Z-Image Turbo
('higgsfield','Z-Image','Z-Image','higgsfield','Z-Image Turbo','Very fast image generation with strong text rendering.','z-image/turbo','image','text-to-image',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["1:1","16:9","9:16","4:3","3:4"],"default":"1:1"},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":0,"max":2147483647}
 ]}'::jsonb,
 '{}'::jsonb,'Cheapest fast drafts and text rendering',true,40,
 ARRAY['fast','economy','text_accuracy'],'verified',0,0,false,false,false,true,false,false),

-- Recraft
('higgsfield','Recraft','Recraft','higgsfield','Recraft 4.1','Design-grade graphics, layout and controlled colour.','recraft/v4.1/utility/text-to-image','image','text-to-image',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["1:1","16:9","9:16","4:3","3:4"],"default":"1:1"},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["1k","2k"],"default":"1k"},
   {"key":"background","type":"select","label":"Background","advanced":true,"options":["auto","transparent","white"],"default":"auto"}
 ]}'::jsonb,
 '{}'::jsonb,'Graphic design and brand creative',true,41,
 ARRAY['graphic_design','brand_creative','controlled_colour','layout'],'verified',0,0,false,false,false,false,false,false),

-- Soul Standard
('higgsfield','Soul','Soul','higgsfield','Soul Standard','Soul image generation with style strength control.','higgsfield-ai/soul/standard','image','text-to-image',
 '{"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000},
   {"key":"style_id","type":"text","label":"Style ID","advanced":true},
   {"key":"style_strength","type":"slider","label":"Style strength","min":0,"max":1,"step":0.05,"default":0.6},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","options":["4:3","3:4","1:1","16:9","9:16","2:3","3:2"],"default":"4:3"},
   {"key":"resolution","type":"segmented","label":"Resolution","options":["720p","1080p"],"default":"720p"},
   {"key":"seed","type":"seed","label":"Seed","advanced":true,"min":1,"max":1000000}
 ]}'::jsonb,
 '{}'::jsonb,'Styled image generation',true,42,
 ARRAY['style_control'],'verified',0,0,false,false,false,true,false,false),

-- Soul ID (experimental, inactive)
('higgsfield','Soul','Soul','higgsfield','Soul ID (experimental)','Identity-preserving Soul route. Request contract not yet verified.','higgsfield-ai/soul/id','image','text-to-image',
 '{"cancelable":true}'::jsonb,
 '{"fields":[{"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":4000}]}'::jsonb,
 '{}'::jsonb,'Identity consistency (pending verification)',false,99,
 ARRAY['consistency'],'incomplete',0,0,false,false,false,false,false,false)
ON CONFLICT (provider, model_path, operation) DO NOTHING;