/**
 * What the API schemas can't say: how each Higgsfield workflow is presented in
 * the studio. Names, families, the studio operation, catalogue order, media
 * roles, and the occasional field the schema allows but the workflow's notes
 * restrict. Everything else (fields, options, defaults, limits) is derived from
 * the schema by build-registry.mjs, which also checks this file against it.
 *
 * Media roles are the database's input_role values. The conventions:
 *   image_url → source (the start frame for video), image_urls → reference,
 *   first_frame_url → first_frame, end/last frame URLs → last_frame,
 *   video_url → source, video_urls → video, audio(_urls) → audio.
 */

/** Media params and the role and label each takes unless an entry says otherwise. */
export const MEDIA_PARAMS = {
  image_url: { role: "source", type: "image", label: "Source image" },
  image_urls: { role: "reference", type: "image", label: "Reference images" },
  image_reference_url: { role: "reference", type: "image", label: "Style reference" },
  first_frame_url: { role: "first_frame", type: "image", label: "Start frame" },
  last_frame_url: { role: "last_frame", type: "image", label: "End frame" },
  last_image_url: { role: "last_frame", type: "image", label: "End frame" },
  end_image_url: { role: "last_frame", type: "image", label: "End frame" },
  video_url: { role: "source", type: "video", label: "Source video" },
  video_urls: { role: "video", type: "video", label: "Reference videos" },
  audio_url: { role: "audio", type: "audio", label: "Audio" },
  audio_urls: { role: "audio", type: "audio", label: "Reference audio" },
};

/** Params the studio doesn't offer, with the reason; any other schema param must be used. */
export const SKIPPED_PARAMS = {
  elements: "Kling element IDs belong to elements created in the provider console",
  multi_prompt: "Per-shot prompts need a shot editor the studio doesn't have yet",
  colors: "Palette objects need a colour editor the studio doesn't have yet",
  background_color: "Colour objects need a colour editor the studio doesn't have yet",
  file_url: "Document references aren't studio assets",
  link_url: "Web-page references aren't studio assets",
};

/** Field labels by param, unless an entry says otherwise. */
export const LABELS = {
  prompt: "Prompt",
  negative_prompt: "Negative prompt",
  aspect_ratio: "Aspect ratio",
  resolution: "Resolution",
  duration: "Duration (s)",
  quality: "Quality",
  generate_audio: "Native audio",
  sound: "Native audio",
  seed: "Seed",
  cfg_scale: "Prompt adherence",
  enhance_prompt: "Enhance prompt",
  prompt_extend: "Prompt expansion",
  prompt_extend_mode: "Expansion mode",
  enable_thinking: "Reasoning",
  prompt_optimizer: "Prompt optimizer",
  batch_size: "Batch size",
  moderation: "Moderation",
  output_format: "Format",
  bitrate_mode: "Bitrate",
  fps: "Frame rate",
  camera_movement: "Camera movement",
  camera_lens: "Lens",
  camera_model: "Camera",
  camera_aperture: "Aperture",
  color_palette: "Colour palette",
  era: "Era",
  genre: "Genre",
  light: "Lighting",
  pacing: "Pacing",
  rendering_speed: "Rendering speed",
  image_weight: "Image weight",
  style_id: "Style ID",
  style_strength: "Style strength",
  custom_reference_id: "Character reference ID",
  custom_reference_strength: "Character strength",
  keep_original_sound: "Keep original sound",
  character_orientation: "Orientation from",
  mode: "Mode",
  shot_type: "Shot type",
  multi_shots: "Multi-shot",
  aigc_watermark: "AI-generated watermark",
  niche: "Niche",
  language: "Copy language",
  target_audience: "Target audience",
  preset_id: "Preset",
};

/** Params shown under Advanced settings. */
export const ADVANCED = new Set([
  "seed",
  "negative_prompt",
  "cfg_scale",
  "bitrate_mode",
  "output_format",
  "moderation",
  "prompt_extend",
  "prompt_extend_mode",
  "enable_thinking",
  "aigc_watermark",
  "fps",
  "style_id",
  "style_strength",
  "custom_reference_id",
  "custom_reference_strength",
  "prompt_optimizer",
  "multi_shots",
  "shot_type",
  "language",
]);

/** Main-panel order; unlisted fields follow in schema order. */
export const FIELD_ORDER = [
  "prompt",
  "aspect_ratio",
  "resolution",
  "duration",
  "mode",
  "quality",
  "rendering_speed",
  "batch_size",
  "sound",
  "generate_audio",
  "enhance_prompt",
  "preset_id",
];

/** Option labels where the API's value isn't readable as is. */
export const OPTION_LABELS = {
  sound: { on: "On", off: "Off" },
  keep_original_sound: { yes: "Yes", no: "No" },
  mode: { std: "Standard", pro: "Pro", "4k": "4K" },
  quality: { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" },
  rendering_speed: { TURBO: "Turbo", DEFAULT: "Default", QUALITY: "Quality" },
  camera_aperture: {
    "f14-wide-open": "f/1.4 · wide open",
    "f4-moderate": "f/4 · moderate",
    "f11-deep-focus": "f/11 · deep focus",
  },
  camera_model: {
    modern: "Modern digital",
    "35mm-film": "35mm film",
    "8mm-film": "8mm film",
    "dv-camcorder": "DV camcorder",
  },
  output_format: { jpg: "JPG", png: "PNG", webp: "WebP", mp4: "MP4", mov: "MOV" },
  bitrate_mode: { standard: "Standard", high: "High" },
  shot_type: { customize: "Custom", intelligent: "Intelligent" },
  character_orientation: { image: "Image", video: "Video" },
  moderation: { auto: "Auto", low: "Low" },
  prompt_extend_mode: { direct: "Direct", agent: "Agent" },
};

const t2v = "text-to-video";
const i2v = "image-to-video";
const r2v = "reference-to-video";
const t2i = "text-to-image";

/** The workflow name appended to a model's name for everything but its main workflow. */
export const WORKFLOW_SUFFIX = {
  [i2v]: "Image to video",
  [r2v]: "Reference to video",
  "video-edit": "Video edit",
  "video-extend": "Video extend",
  "image-to-image": "Image edit",
  "image-edit": "Edit",
};

const START_FRAME = { image_url: { label: "Start frame" } };

/** Reasoning only works on an expanded prompt; the API rejects it on its own. */
const QWEN_FIELDS = {
  enable_thinking: {
    requires: {
      field: "prompt_extend",
      equals: true,
      message: "Reasoning needs prompt expansion switched on",
    },
  },
};

/**
 * One entry per generation endpoint, in catalogue order. Keys:
 *   name, family, operation, sort        how it is listed
 *   recommended                          the "best for" line
 *   tags                                 router / Cinema Mode tags
 *   media                                per-param overrides: role, label, max, required
 *   fields                               per-param field overrides
 *   promptRequired                       the notes require a prompt the schema leaves optional
 *   rules                                input rules across slots (see model-schema.ts)
 *   variants                             extra rows on the same endpoint (an edit mode)
 *   omit                                 schema params this row deliberately leaves out
 *   fixed                                params always sent with one value, without a control
 */
export const MODELS = [
  // ── Image ────────────────────────────────────────────────────────────────
  {
    endpoint: "higgsfield-ai/soul/v2/standard",
    name: "Soul 2",
    family: "Soul",
    operation: t2i,
    sort: 10,
    recommended: "Fast creative image generation",
    tags: ["style_control"],
  },
  {
    endpoint: "higgsfield-ai/soul/cinema",
    name: "Soul Cinema",
    family: "Soul",
    operation: t2i,
    sort: 11,
    recommended: "Film-look stills and key frames",
    tags: ["cinematic"],
  },
  {
    endpoint: "higgsfield-ai/soul/standard",
    name: "Soul Standard",
    family: "Soul",
    operation: t2i,
    sort: 12,
    recommended: "Styled images with adjustable style strength",
    tags: ["style_control"],
  },
  {
    endpoint: "marketing-studio/image",
    name: "Marketing Studio 2.0 Alpha",
    family: "Marketing Studio",
    operation: t2i,
    sort: 20,
    recommended: "Product and campaign creative",
    tags: ["brand_creative"],
    media: { image_urls: { label: "Product & reference images" } },
    fields: marketingFields({ presetQualityLocked: true }),
    rules: marketingRules(),
    variants: [
      {
        name: "Marketing Studio 2.0 Alpha (Image edit)",
        operation: "image-to-image",
        sort: 21,
        recommended: "Product and campaign creative editing",
        media: { image_urls: { label: "Product & reference images", required: true } },
      },
    ],
  },
  {
    endpoint: "marketing-studio/image/flare",
    name: "Marketing Studio 2.5 Flare",
    family: "Marketing Studio",
    operation: t2i,
    sort: 22,
    recommended: "Premium product and campaign creative",
    tags: ["brand_creative"],
    media: { image_urls: { label: "Product & reference images" } },
    fields: marketingFields(),
    rules: marketingRules(),
    variants: [
      {
        name: "Marketing Studio 2.5 Flare (Image edit)",
        operation: "image-to-image",
        sort: 23,
        recommended: "Premium product and campaign editing",
        media: { image_urls: { label: "Product & reference images", required: true } },
      },
    ],
  },
  {
    endpoint: "marketing-studio/image/sunburst",
    name: "Marketing Studio 2.5 Sunburst",
    family: "Marketing Studio",
    operation: t2i,
    sort: 24,
    recommended: "Bright, high-energy campaign creative",
    tags: ["brand_creative"],
    media: { image_urls: { label: "Product & reference images" } },
    fields: marketingFields(),
    rules: marketingRules(),
    variants: [
      {
        name: "Marketing Studio 2.5 Sunburst (Image edit)",
        operation: "image-to-image",
        sort: 25,
        recommended: "Bright, high-energy campaign editing",
        media: { image_urls: { label: "Product & reference images", required: true } },
      },
    ],
  },
  {
    endpoint: "higgsfield/ads-studio/v1.0",
    name: "Ads Studio",
    family: "Ads Studio",
    operation: t2i,
    sort: 26,
    recommended: "Ad concepts from a marketing brief",
    tags: ["brand_creative"],
    media: { image_urls: { label: "Product references" } },
    fields: {
      prompt: { label: "Brief" },
      batch_size: { label: "Ad concepts" },
      target_audience: { type: "textarea" },
    },
  },
  {
    endpoint: "ideogram/v4.0",
    name: "Ideogram 4",
    family: "Ideogram",
    operation: t2i,
    sort: 30,
    recommended: "Typography, posters and text in images",
    tags: ["text_accuracy"],
    omit: ["image_url", "image_weight"],
    variants: [
      {
        name: "Ideogram 4 (Image edit)",
        operation: "image-to-image",
        sort: 31,
        recommended: "Remixing an image with text-accurate edits",
        omit: [],
        media: { image_url: { required: true } },
      },
    ],
  },
  {
    endpoint: "alibaba/qwen-image-3/text-to-image",
    name: "Qwen Image 3",
    family: "Qwen",
    operation: t2i,
    sort: 35,
    recommended: "Prompt-faithful, multilingual images",
    tags: ["multilingual", "prompt_adherence"],
    fields: QWEN_FIELDS,
  },
  {
    endpoint: "alibaba/qwen-image-3/edit",
    name: "Qwen Image 3 (Edit)",
    family: "Qwen",
    operation: "image-edit",
    sort: 36,
    recommended: "Instruction-based image editing",
    tags: ["image_edit", "consistency"],
    media: { image_urls: { role: "source", label: "Images to edit" } },
    fields: QWEN_FIELDS,
  },
  {
    endpoint: "xai/grok-imagine-image-2.0",
    name: "Grok Imagine Image 2.0",
    family: "Grok",
    operation: t2i,
    sort: 40,
    recommended: "Quick images and edits",
    tags: ["fast", "image_edit"],
    media: { image_urls: { label: "Images to edit" } },
  },
  {
    endpoint: "recraft/v4.1/text-to-image",
    name: "Recraft V4.1",
    family: "Recraft",
    operation: t2i,
    sort: 45,
    recommended: "Design-led images and illustration",
    tags: ["graphic_design", "brand_creative", "layout"],
  },
  {
    endpoint: "recraft/v4.1/pro/text-to-image",
    name: "Recraft V4.1 Pro",
    family: "Recraft",
    operation: t2i,
    sort: 46,
    recommended: "High-resolution design-led images",
    tags: ["graphic_design", "brand_creative", "layout"],
  },
  {
    endpoint: "recraft/v4.1/utility/text-to-image",
    name: "Recraft V4.1 Utility",
    family: "Recraft",
    operation: t2i,
    sort: 47,
    recommended: "Graphic design, layouts and brand assets",
    tags: ["graphic_design", "brand_creative", "controlled_colour", "layout"],
  },
  {
    endpoint: "recraft/v4.1/utility/pro/text-to-image",
    name: "Recraft V4.1 Utility Pro",
    family: "Recraft",
    operation: t2i,
    sort: 48,
    recommended: "High-resolution graphic design and brand assets",
    tags: ["graphic_design", "brand_creative", "layout"],
  },
  {
    endpoint: "z-image/turbo",
    name: "Z-Image Turbo",
    family: "Z-Image",
    operation: t2i,
    sort: 50,
    recommended: "Fast, economical images",
    tags: ["fast", "economy", "text_accuracy"],
  },

  // ── Video ────────────────────────────────────────────────────────────────
  {
    endpoint: "higgsfield/cinema-studio/4.0",
    name: "Cinema Studio 4.0",
    family: "Cinema Studio",
    operation: "cinematic-video",
    sort: 100,
    recommended: "Cinematic campaign film-making",
    tags: ["cinematic", "camera_control", "native_audio"],
    fields: Object.fromEntries(
      [
        "era",
        "light",
        "pacing",
        "camera_model",
        "camera_lens",
        "camera_aperture",
        "color_palette",
      ].map((key) => [key, { advanced: true }]),
    ),
  },
  ...seedance("bytedance/seedance-2.5", "Seedance 2.5", 110, {
    reference: { image_urls: 30, video_urls: 10, audio_urls: 10 },
    referenceRule: {
      kind: "anyOf",
      roles: ["reference", "video", "audio"],
      message: "Add at least one reference image, video or audio file",
    },
    editing: true,
  }),
  ...seedance("bytedance/seedance-2.0", "Seedance 2.0", 115, {
    reference: { image_urls: 9, video_urls: 3, audio_urls: 3 },
    referenceRule: {
      kind: "anyOf",
      roles: ["reference", "video"],
      message: "Add at least one reference image or video (audio alone isn't enough)",
    },
    editing: false,
  }),
  ...kling3("std", "Standard", 120),
  ...kling3("pro", "Pro", 122),
  ...kling3("4k", "4K", 124),
  {
    endpoint: "kling-video/v3.0-turbo/text-to-video",
    name: "Kling 3.0 Turbo",
    family: "Kling",
    operation: t2v,
    sort: 126,
    recommended: "Quick Kling 3.0 drafts",
    tags: ["fast"],
    promptRequired: true,
  },
  {
    endpoint: "kling-video/v3.0-turbo/image-to-video",
    name: "Kling 3.0 Turbo (Image to video)",
    family: "Kling",
    operation: i2v,
    sort: 127,
    recommended: "Quick Kling 3.0 animation from a frame",
    tags: ["fast"],
    media: START_FRAME,
    promptRequired: true,
  },
  ...klingOmni("o3", "Kling O3", 130),
  ...klingOmni("omni", "Kling Omni", 135),
  {
    endpoint: "kling-video/v2.6/pro/text-to-video",
    name: "Kling 2.6 Pro",
    family: "Kling",
    operation: t2v,
    sort: 140,
    recommended: "Kling 2.6 video with native audio",
    tags: ["native_audio"],
  },
  {
    endpoint: "kling-video/v2.6/pro/image-to-video",
    name: "Kling 2.6 Pro (Image to video)",
    family: "Kling",
    operation: i2v,
    sort: 141,
    recommended: "Animating a frame with native audio",
    tags: ["native_audio"],
    media: START_FRAME,
  },
  {
    endpoint: "kling-video/v2.5-turbo/pro/text-to-video",
    name: "Kling 2.5 Turbo Pro",
    family: "Kling",
    operation: t2v,
    sort: 142,
    recommended: "Fast, economical Kling video",
    tags: ["fast", "economy"],
  },
  {
    endpoint: "kling-video/v2.5-turbo/pro/image-to-video",
    name: "Kling 2.5 Turbo Pro (Image to video)",
    family: "Kling",
    operation: i2v,
    sort: 143,
    recommended: "Fast, economical frame animation",
    tags: ["fast", "economy"],
    media: START_FRAME,
  },
  {
    endpoint: "kling-video/v2.5-turbo/standard/image-to-video",
    name: "Kling 2.5 Turbo Standard (Image to video)",
    family: "Kling",
    operation: i2v,
    sort: 144,
    recommended: "Cheapest Kling frame animation",
    tags: ["fast", "economy"],
    media: START_FRAME,
  },
  motionControl("kling-video/v3/motion-control/pro", "Kling 3.0 Motion Control Pro", 145),
  motionControl("kling-video/v3/motion-control/std", "Kling 3.0 Motion Control Standard", 146),
  motionControl("kling-video/motion-control/pro", "Kling 2.6 Motion Control Pro", 147),
  motionControl("kling-video/motion-control/std", "Kling 2.6 Motion Control Standard", 148),
  ...wan("alibaba/wan-3.0", "Wan 3.0", 150, "Long, high-resolution video with audio"),
  ...wan("alibaba/wan-3.0-prime", "Wan 3.0 Prime", 153, "Wan 3.0 at its highest quality"),
  ...wan("wan/v2.7", "Wan 2.7", 156, "Video driven by audio, with start and end frames"),
  ...wan("wan/v2.6", "Wan 2.6", 159, "Multi-shot video with driving audio"),
  {
    endpoint: "minimax/h3/text-to-video",
    name: "MiniMax H3",
    family: "MiniMax",
    operation: t2v,
    sort: 170,
    recommended: "Dynamic motion at 2K",
    tags: ["motion", "high_resolution_video"],
  },
  {
    endpoint: "minimax/h3/image-to-video",
    name: "MiniMax H3 (Image to video)",
    family: "MiniMax",
    operation: i2v,
    sort: 171,
    recommended: "Animating a frame at 2K",
    tags: ["motion", "high_resolution_video"],
    media: START_FRAME,
  },
  {
    endpoint: "minimax/h3/reference-to-video",
    name: "MiniMax H3 (Reference to video)",
    family: "MiniMax",
    operation: r2v,
    sort: 172,
    recommended: "2K video guided by reference media",
    tags: ["motion", "high_resolution_video", "consistency"],
    rules: [
      {
        kind: "anyOf",
        roles: ["reference", "video"],
        message: "Add at least one reference image or video (audio needs one of them)",
      },
    ],
  },
  {
    endpoint: "minimax/hailuo-2.3/standard/text-to-video",
    name: "Hailuo 2.3 Standard",
    family: "MiniMax",
    operation: t2v,
    sort: 175,
    recommended: "Economical 768p video",
    tags: ["economy"],
  },
  {
    endpoint: "minimax/hailuo-2.3/standard/image-to-video",
    name: "Hailuo 2.3 Standard (Image to video)",
    family: "MiniMax",
    operation: i2v,
    sort: 176,
    recommended: "Economical frame animation",
    tags: ["economy"],
    media: START_FRAME,
  },
  {
    endpoint: "lightricks/ltx-2.5/text-to-video/fast",
    name: "LTX 2.5 Fast",
    family: "LTX",
    operation: t2v,
    sort: 180,
    recommended: "Fast iteration on video ideas",
    tags: ["native_audio", "high_resolution_video", "camera_control", "fast"],
  },
  {
    endpoint: "lightricks/ltx-2.5/image-to-video/fast",
    name: "LTX 2.5 Fast (Image to video)",
    family: "LTX",
    operation: i2v,
    sort: 181,
    recommended: "Fast frame animation up to 4K",
    tags: ["native_audio", "high_resolution_video", "camera_control", "fast"],
    media: START_FRAME,
  },
  {
    endpoint: "lightricks/ltx-2.5/text-to-video/pro",
    name: "LTX 2.5 Pro",
    family: "LTX",
    operation: t2v,
    sort: 182,
    recommended: "Higher-quality LTX video",
    tags: ["native_audio", "high_resolution_video", "camera_control", "quality"],
  },
  {
    endpoint: "lightricks/ltx-2.5/image-to-video/pro",
    name: "LTX 2.5 Pro (Image to video)",
    family: "LTX",
    operation: i2v,
    sort: 183,
    recommended: "Higher-quality frame animation",
    tags: ["native_audio", "high_resolution_video", "camera_control", "quality"],
    media: START_FRAME,
  },
  {
    endpoint: "pixverse/v6/text-to-video",
    name: "PixVerse V6",
    family: "PixVerse",
    operation: t2v,
    sort: 185,
    recommended: "Stylised short video with audio",
    tags: ["native_audio"],
  },
  {
    endpoint: "pixverse/v6/image-to-video",
    name: "PixVerse V6 (Image to video)",
    family: "PixVerse",
    operation: i2v,
    sort: 186,
    recommended: "Animating a frame with audio",
    tags: ["native_audio"],
    media: START_FRAME,
  },
  ...happyHorse("alibaba/happy-horse/v1.1", "HappyHorse 1.1", 190),
  ...happyHorse("alibaba/happy-horse", "HappyHorse 1.0", 193),
  {
    endpoint: "xai/grok-imagine-video/v1.5/reference-to-video",
    name: "Grok Imagine Video 1.5",
    family: "Grok",
    operation: r2v,
    sort: 197,
    recommended: "Quick video from text, a frame or references",
    tags: ["fast"],
    media: {
      image_url: { role: "first_frame", label: "Start frame" },
      image_urls: { max: 7 },
      audio_url: { label: "Reference audio" },
    },
    rules: [
      {
        kind: "exclusive",
        groups: [["first_frame"], ["reference", "audio"]],
        message: "Use either a start frame or reference images and audio, not both",
      },
    ],
  },
  {
    endpoint: "higgsfield/genjutsu/motion-transfer/v1.0",
    legacyPath: "higgsfiled/genjutsu/motion-transfer/v1.0",
    name: "Genjutsu Motion Transfer",
    family: "Genjutsu",
    operation: "motion-transfer",
    sort: 200,
    recommended: "Re-cast motion onto a new subject",
    tags: ["motion_transfer", "consistency"],
    media: { image_urls: { label: "Subject references" } },
    fields: { prompt: { label: "Instruction" } },
  },
  {
    endpoint: "higgsfield/genjutsu/object-swap/v1.0",
    legacyPath: "higgsfiled/genjutsu/object-swap/v1.0",
    name: "Genjutsu Object Swap",
    family: "Genjutsu",
    operation: "object-swap",
    sort: 201,
    recommended: "Product and object replacement in video",
    tags: ["object_swap", "brand_creative"],
    media: { image_urls: { label: "Replacement references" } },
    fields: { prompt: { label: "Instruction" } },
  },
  {
    endpoint: "higgsfield/genjutsu/restyle/v1.0",
    name: "Genjutsu Restyle",
    family: "Genjutsu",
    operation: "video-to-video",
    sort: 202,
    recommended: "Restyling a video while keeping its motion",
    tags: ["style_control"],
    media: { image_urls: { label: "Character references" } },
    fields: {
      prompt: {
        label: "Instruction",
        description:
          "Optional guidance alongside the style, such as which subjects or details to keep.",
      },
      preset_id: {
        label: "Style",
        source: "genjutsu-restyle",
        description: "The look to restyle the video in. Motion, framing and sound are kept.",
      },
    },
  },
];

function marketingFields({ presetQualityLocked = false } = {}) {
  return {
    enhance_prompt: {
      label: "Preset mode",
      description:
        "Builds the shot from a campaign preset. Needs one or two images: the product first, then an optional model or person.",
    },
    preset_id: {
      label: "Campaign preset",
      source: "marketing-studio",
      description: "A campaign look from Higgsfield's preset library.",
      required: true,
      showIf: { field: "enhance_prompt", equals: true },
    },
    // 2.0 renders preset mode at high quality only, which is its default.
    ...(presetQualityLocked
      ? { quality: { showIf: { field: "enhance_prompt", equals: false } } }
      : {}),
  };
}

function marketingRules() {
  return [
    {
      kind: "anyOf",
      roles: ["reference"],
      when: { field: "enhance_prompt", equals: true },
      message: "Preset mode needs a product image",
    },
    {
      kind: "maxTotal",
      roles: ["reference"],
      max: 2,
      when: { field: "enhance_prompt", equals: true },
      message: "Preset mode takes at most two images: the product, then a model",
    },
  ];
}

function seedance(base, name, sort, { reference, referenceRule, editing }) {
  const references = {
    image_urls: { max: reference.image_urls },
    video_urls: { max: reference.video_urls },
    audio_urls: { max: reference.audio_urls },
  };
  const rows = [
    {
      endpoint: `${base}/text-to-video`,
      name,
      family: "Seedance",
      operation: t2v,
      sort,
      recommended: "Cinematic video with native audio",
      tags: ["cinematic", "native_audio"],
    },
    {
      endpoint: `${base}/image-to-video`,
      name: `${name} (Image to video)`,
      family: "Seedance",
      operation: i2v,
      sort: sort + 1,
      recommended: "Animating a frame with native audio",
      tags: ["native_audio"],
      media: START_FRAME,
    },
    {
      endpoint: `${base}/reference-to-video`,
      name: `${name} (Reference to video)`,
      family: "Seedance",
      operation: r2v,
      sort: sort + 2,
      recommended: "Video guided by reference images, video and audio",
      tags: ["consistency", "native_audio"],
      media: references,
      rules: [referenceRule],
    },
  ];
  if (editing)
    rows.push(
      {
        endpoint: `${base}/video-edit`,
        name: `${name} (Video edit)`,
        family: "Seedance",
        operation: "video-edit",
        sort: sort + 3,
        recommended: "Editing shots without regenerating them",
        tags: ["video_edit"],
        // The source video counts toward the ten-video limit.
        media: { ...references, video_urls: { max: reference.video_urls - 1 } },
        fields: { prompt: { label: "Edit instruction" } },
      },
      {
        endpoint: `${base}/video-extend`,
        name: `${name} (Video extend)`,
        family: "Seedance",
        operation: "video-extend",
        sort: sort + 4,
        recommended: "Continuing a shot past its last frame",
        tags: ["video_extend"],
        media: { ...references, video_urls: { max: reference.video_urls - 1 } },
      },
    );
  return rows;
}

function kling3(tier, label, sort) {
  const name = `Kling 3.0 ${label}`;
  const recommended = {
    std: "Kling 3.0 video at the standard tier",
    pro: "Kling 3.0 video at the pro tier",
    "4k": "Kling 3.0 video in native 4K",
  }[tier];
  const tags = tier === "4k" ? ["native_audio", "high_resolution_video"] : ["native_audio"];
  return [
    {
      endpoint: `kling-video/v3.0/${tier}/text-to-video`,
      name,
      family: "Kling",
      operation: t2v,
      sort,
      recommended,
      tags,
      promptRequired: true,
    },
    {
      endpoint: `kling-video/v3.0/${tier}/image-to-video`,
      name: `${name} (Image to video)`,
      family: "Kling",
      operation: i2v,
      sort: sort + 1,
      recommended: `${recommended}, from a start frame`,
      tags,
      media: START_FRAME,
      promptRequired: true,
    },
  ];
}

function klingOmni(version, name, sort) {
  // No limit is published; Kling's omni models take up to seven reference images.
  const imageMax = 7;
  // O3's multi-shot mode needs per-shot prompts, which the studio doesn't offer
  // yet. Its schema only waives them when multi_shots is sent as false.
  const fixed = version === "o3" ? { multi_shots: false } : undefined;
  return [
    {
      endpoint: `kling-video/${version}/first-last-frame`,
      name: `${name} (First & last frame)`,
      family: "Kling",
      operation: i2v,
      sort,
      recommended: "Video between a start and an end frame",
      tags: ["consistency"],
      media: { first_frame_url: { required: true } },
      promptRequired: true,
      fixed,
    },
    {
      endpoint: `kling-video/${version}/image-reference`,
      name: `${name} (Image reference)`,
      family: "Kling",
      operation: r2v,
      sort: sort + 1,
      recommended: "Consistent characters and products from reference images",
      tags: ["consistency"],
      media: { image_urls: { max: imageMax } },
      promptRequired: true,
      fixed,
    },
    {
      endpoint: `kling-video/${version}/video-edit`,
      name: `${name} (Video edit)`,
      family: "Kling",
      operation: "video-edit",
      sort: sort + 2,
      recommended: "Prompt-driven edits to an existing clip",
      tags: ["video_edit"],
      media: { video_urls: { role: "source", label: "Source video" } },
      fields: { prompt: { label: "Edit instruction" } },
    },
    {
      endpoint: `kling-video/${version}/video-reference`,
      name: `${name} (Video reference)`,
      family: "Kling",
      operation: r2v,
      sort: sort + 3,
      recommended: "New shots that follow a reference clip",
      tags: ["consistency"],
      media: { video_urls: { label: "Reference video" } },
    },
  ];
}

function motionControl(endpoint, name, sort) {
  return {
    endpoint,
    name,
    family: "Kling",
    operation: "motion-control",
    sort,
    recommended: "Animating a character with reference motion",
    tags: ["motion_control", "consistency"],
    media: {
      image_url: { role: "image", label: "Character image" },
      video_url: { role: "video", label: "Motion video" },
    },
  };
}

function wan(base, name, sort, recommended) {
  const v26 = base === "wan/v2.6";
  const v27 = base === "wan/v2.7";
  const reference = v27
    ? {
        media: { image_urls: { max: 5 }, video_urls: { max: 5 } },
        rules: [
          {
            kind: "anyOf",
            roles: ["reference", "video"],
            message: "Add at least one reference image or video",
          },
          {
            kind: "maxTotal",
            roles: ["reference", "video"],
            max: 5,
            message: "Use at most five reference images and videos in total",
          },
        ],
      }
    : {};
  const audio = v26 || v27 ? { audio_url: { label: "Driving audio" } } : {};
  const tags = v26 || v27 ? [] : ["native_audio"];
  return [
    {
      endpoint: `${base}/text-to-video`,
      name,
      family: "Wan",
      operation: t2v,
      sort,
      recommended,
      tags,
      media: audio,
    },
    {
      endpoint: `${base}/image-to-video`,
      name: `${name} (Image to video)`,
      family: "Wan",
      operation: i2v,
      sort: sort + 1,
      recommended: `${recommended}, from a start frame`,
      tags,
      media: { ...START_FRAME, ...audio },
    },
    {
      endpoint: `${base}/reference-to-video`,
      name: `${name} (Reference to video)`,
      family: "Wan",
      operation: r2v,
      sort: sort + 2,
      recommended: `${recommended}, guided by references`,
      tags: ["consistency"],
      ...reference,
    },
  ];
}

function happyHorse(base, name, sort) {
  return [
    {
      endpoint: `${base}/text-to-video`,
      name,
      family: "HappyHorse",
      operation: t2v,
      sort,
      recommended: "Expressive short video",
      tags: [],
      promptRequired: true,
    },
    {
      endpoint: `${base}/image-to-video`,
      name: `${name} (Image to video)`,
      family: "HappyHorse",
      operation: i2v,
      sort: sort + 1,
      recommended: "Animating a frame",
      tags: [],
      media: START_FRAME,
    },
    {
      endpoint: `${base}/reference-to-video`,
      name: `${name} (Reference to video)`,
      family: "HappyHorse",
      operation: r2v,
      sort: sort + 2,
      recommended: "Video guided by up to nine reference images",
      tags: ["consistency"],
      // Enforced at submission even though the schema sets no limit.
      media: { image_urls: { max: 9 } },
    },
  ];
}
