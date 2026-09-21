
INSERT INTO public.model_registry (family, display_name, description, model_path, output_type, operation, capabilities, parameter_schema, default_parameters, recommended_for, sort_order) VALUES
('Soul','Soul 2','Fast, high quality creative image generation.','higgsfield-ai/soul/v2/standard','image','text-to-image',
 '{"inputs":[],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"4:3","options":["9:16","16:9","4:3","3:4","1:1","2:3","3:2"]},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"720p","options":["720p","1080p"]},
   {"key":"batch_size","type":"segmented","label":"Batch","default":1,"options":[1,4]},
   {"key":"enhance_prompt","type":"boolean","label":"Enhance prompt","default":true},
   {"key":"seed","type":"seed","label":"Seed","min":1,"max":1000000,"advanced":true},
   {"key":"style_id","type":"text","label":"Style ID","advanced":true}
 ]}'::jsonb,
 '{"aspect_ratio":"4:3","resolution":"720p","batch_size":1,"enhance_prompt":true}'::jsonb,
 'Fast creative image generation',10),

('Ideogram','Ideogram 4','Typography, design and high quality image creation.','ideogram/v4.0','image','text-to-image',
 '{"inputs":[],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":2048},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"1:1","options":["1:1","1:2","2:1","2:3","3:2","4:5","5:4","9:16","16:9","5:8","8:5","3:4","4:3","9:22","22:9","9:23","23:9","3:8","8:3","5:12","12:5","1:3","3:1"]},
   {"key":"rendering_speed","type":"segmented","label":"Rendering speed","default":"DEFAULT","options":["TURBO","DEFAULT","QUALITY"],"advanced":true}
 ]}'::jsonb,
 '{"aspect_ratio":"1:1","rendering_speed":"DEFAULT"}'::jsonb,
 'Typography, design and high-quality image creation',20),

('Ideogram','Ideogram 4 (Image edit)','Edit or restyle an existing image with Ideogram 4.','ideogram/v4.0','image','image-to-image',
 '{"inputs":[{"role":"source","type":"image","required":true,"max":1,"param":"image_url"}],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"minLength":2,"maxLength":2048},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"1:1","options":["1:1","2:3","3:2","4:5","5:4","9:16","16:9","3:4","4:3"]},
   {"key":"image_weight","type":"slider","label":"Image weight","default":50,"min":1,"max":100,"step":1,"showIf":{"hasInput":"source"}},
   {"key":"rendering_speed","type":"segmented","label":"Rendering speed","default":"DEFAULT","options":["TURBO","DEFAULT","QUALITY"],"advanced":true}
 ]}'::jsonb,
 '{"aspect_ratio":"1:1","rendering_speed":"DEFAULT","image_weight":50}'::jsonb,
 'Image editing with strong prompt adherence',21),

('Marketing Studio','Marketing Studio Image','Product and campaign creative generation.','marketing-studio/image','image','text-to-image',
 '{"inputs":[{"role":"reference","type":"image","required":false,"max":4,"param":"image_urls","array":true}],"presets":true,"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"2k","options":["1k","2k","4k"]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"auto","options":["auto","1:1","3:2","2:3","4:3","3:4","16:9","9:16","21:9"]},
   {"key":"enhance_prompt","type":"boolean","label":"Enhanced preset mode","default":false},
   {"key":"preset_id","type":"preset","label":"Campaign preset","required":true,"showIf":{"field":"enhance_prompt","equals":true}},
   {"key":"quality","type":"select","label":"Quality","default":"auto","options":["auto","low","medium","high"],"advanced":true},
   {"key":"moderation","type":"select","label":"Moderation","default":"auto","options":["auto","low"],"advanced":true}
 ]}'::jsonb,
 '{"resolution":"2k","aspect_ratio":"auto","enhance_prompt":false,"quality":"auto","moderation":"auto"}'::jsonb,
 'Product and campaign creative',30),

('Marketing Studio','Marketing Studio Edit','Campaign edit using one or more product references.','marketing-studio/image','image','image-to-image',
 '{"inputs":[{"role":"reference","type":"image","required":true,"max":4,"param":"image_urls","array":true}],"presets":true,"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"2k","options":["1k","2k","4k"]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"auto","options":["auto","1:1","3:2","2:3","4:3","3:4","16:9","9:16","21:9"]},
   {"key":"enhance_prompt","type":"boolean","label":"Enhanced preset mode","default":false},
   {"key":"preset_id","type":"preset","label":"Campaign preset","required":true,"showIf":{"field":"enhance_prompt","equals":true}},
   {"key":"quality","type":"select","label":"Quality","default":"auto","options":["auto","low","medium","high"],"advanced":true},
   {"key":"moderation","type":"select","label":"Moderation","default":"auto","options":["auto","low"],"advanced":true}
 ]}'::jsonb,
 '{"resolution":"2k","aspect_ratio":"auto","enhance_prompt":false,"quality":"auto","moderation":"auto"}'::jsonb,
 'Product and campaign creative editing',31),

('Wan','Wan 3.0','Flexible general purpose video generation.','alibaba/wan-3.0/text-to-video','video','text-to-video',
 '{"inputs":[],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"duration","type":"slider","label":"Duration (s)","default":5,"min":2,"max":30,"step":1},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"1080p","options":["480p","720p","1080p"]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"adaptive","options":["adaptive","16:9","4:3","1:1","3:4","9:16"]},
   {"key":"generate_audio","type":"boolean","label":"Generate audio","default":true},
   {"key":"seed","type":"seed","label":"Seed","min":0,"max":2147483647,"advanced":true},
   {"key":"enable_thinking","type":"boolean","label":"Enable thinking","default":false,"advanced":true}
 ]}'::jsonb,
 '{"duration":5,"resolution":"1080p","aspect_ratio":"adaptive","generate_audio":true,"enable_thinking":false}'::jsonb,
 'Flexible general video generation',40),

('Kling','Kling 3.0 Standard','High quality cinematic motion from a prompt.','kling-video/v3.0/std/text-to-video','video','text-to-video',
 '{"inputs":[],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2500},
   {"key":"duration","type":"segmented","label":"Duration (s)","default":5,"options":[5,10]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"16:9","options":["16:9","9:16","1:1"]},
   {"key":"sound","type":"boolean","label":"Sound","default":true},
   {"key":"cfg_scale","type":"slider","label":"CFG scale","default":0.5,"min":0,"max":1,"step":0.1,"advanced":true},
   {"key":"multi_shot","type":"boolean","label":"Multi-shot","default":false,"advanced":true},
   {"key":"negative_prompt","type":"text","label":"Negative prompt","advanced":true}
 ]}'::jsonb,
 '{"duration":5,"aspect_ratio":"16:9","sound":true,"cfg_scale":0.5,"multi_shot":false}'::jsonb,
 'High-quality cinematic motion',50),

('Kling','Kling 3.0 Standard (Image to video)','Animate a still image with cinematic motion.','kling-video/v3.0/std/image-to-video','video','image-to-video',
 '{"inputs":[{"role":"source","type":"image","required":true,"max":1,"param":"image_url"},{"role":"last_frame","type":"image","required":false,"max":1,"param":"end_image_url"}],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2500},
   {"key":"duration","type":"segmented","label":"Duration (s)","default":5,"options":[5,10]},
   {"key":"sound","type":"boolean","label":"Sound","default":true},
   {"key":"cfg_scale","type":"slider","label":"CFG scale","default":0.5,"min":0,"max":1,"step":0.1,"advanced":true},
   {"key":"negative_prompt","type":"text","label":"Negative prompt","advanced":true}
 ]}'::jsonb,
 '{"duration":5,"sound":true,"cfg_scale":0.5}'::jsonb,
 'Animating stills with cinematic motion',51),

('Seedance','Seedance 2.5','Advanced long-form video generation.','bytedance/seedance-2.5/text-to-video','video','text-to-video',
 '{"inputs":[],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"duration","type":"slider","label":"Duration (s)","default":5,"min":4,"max":30,"step":1},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"720p","options":["480p","720p"]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"16:9","options":["16:9","4:3","1:1","3:4","9:16","21:9"]},
   {"key":"output_format","type":"segmented","label":"Format","default":"mp4","options":["mp4","mov"],"advanced":true},
   {"key":"generate_audio","type":"boolean","label":"Generate audio","default":true}
 ]}'::jsonb,
 '{"duration":5,"resolution":"720p","aspect_ratio":"16:9","output_format":"mp4","generate_audio":true}'::jsonb,
 'Advanced long-form video',60),

('Seedance','Seedance 2.5 (Image to video)','Animate an image, optionally with an end frame.','bytedance/seedance-2.5/image-to-video','video','image-to-video',
 '{"inputs":[{"role":"source","type":"image","required":true,"max":1,"param":"image_url"},{"role":"last_frame","type":"image","required":false,"max":1,"param":"end_image_url"}],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"duration","type":"slider","label":"Duration (s)","default":5,"min":4,"max":30,"step":1},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"720p","options":["480p","720p"]},
   {"key":"output_format","type":"segmented","label":"Format","default":"mp4","options":["mp4","mov"],"advanced":true},
   {"key":"generate_audio","type":"boolean","label":"Generate audio","default":true}
 ]}'::jsonb,
 '{"duration":5,"resolution":"720p","output_format":"mp4","generate_audio":true}'::jsonb,
 'Animating stills with reference control',61),

('Seedance','Seedance 2.5 (Reference to video)','Combine image, video and audio references into one clip.','bytedance/seedance-2.5/reference-to-video','video','reference-to-video',
 '{"inputs":[{"role":"reference","type":"image","required":false,"max":4,"param":"image_urls","array":true},{"role":"video","type":"video","required":false,"max":2,"param":"video_urls","array":true},{"role":"audio","type":"audio","required":false,"max":1,"param":"audio_urls","array":true}],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":true,"maxLength":2048},
   {"key":"duration","type":"slider","label":"Duration (s)","default":5,"min":4,"max":30,"step":1},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"720p","options":["480p","720p"]},
   {"key":"aspect_ratio","type":"aspect_ratio","label":"Aspect ratio","default":"16:9","options":["16:9","4:3","1:1","3:4","9:16","21:9"]},
   {"key":"output_format","type":"segmented","label":"Format","default":"mp4","options":["mp4","mov"],"advanced":true},
   {"key":"generate_audio","type":"boolean","label":"Generate audio","default":true}
 ]}'::jsonb,
 '{"duration":5,"resolution":"720p","aspect_ratio":"16:9","output_format":"mp4","generate_audio":true}'::jsonb,
 'Multi-reference video composition',62),

('Seedance','Seedance 2.5 (Video extend)','Extend an existing video clip.','bytedance/seedance-2.5/video-extend','video','video-extend',
 '{"inputs":[{"role":"source","type":"video","required":true,"max":1,"param":"video_url"}],"cancelable":true}'::jsonb,
 '{"fields":[
   {"key":"prompt","type":"textarea","label":"Prompt","required":false,"maxLength":2048},
   {"key":"duration","type":"slider","label":"Extension (s)","default":5,"min":4,"max":30,"step":1},
   {"key":"resolution","type":"segmented","label":"Resolution","default":"720p","options":["480p","720p"]},
   {"key":"output_format","type":"segmented","label":"Format","default":"mp4","options":["mp4","mov"],"advanced":true},
   {"key":"generate_audio","type":"boolean","label":"Generate audio","default":true}
 ]}'::jsonb,
 '{"duration":5,"resolution":"720p","output_format":"mp4","generate_audio":true}'::jsonb,
 'Extending existing footage',63);

UPDATE public.app_settings SET value = to_jsonb((SELECT id::text FROM public.model_registry WHERE model_path = 'higgsfield-ai/soul/v2/standard')) WHERE key = 'default_image_model';
UPDATE public.app_settings SET value = to_jsonb((SELECT id::text FROM public.model_registry WHERE model_path = 'alibaba/wan-3.0/text-to-video')) WHERE key = 'default_video_model';
