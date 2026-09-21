/**
 * Shared description of the media-worker task catalogue.
 *
 * This is the single place that defines what tasks exist, what media they
 * accept and how many files they produce. The UI, the server function and the
 * worker all agree through it, so a task can never be queued with a shape the
 * worker will reject.
 */

export type MediaKind = "image" | "video" | "audio";

export interface MediaTaskDefinition {
  type: string;
  label: string;
  description: string;
  /** Accepted asset type for the primary source. */
  accepts: MediaKind[];
  /** Extra sources this task needs, by role. */
  extraSources?: { role: string; accepts: MediaKind[] }[];
  outputKind: MediaKind;
  /** How many files it produces for the given parameters. */
  outputCount: (params: Record<string, unknown>) => number;
  /** File extension and MIME of each produced file. */
  output: (params: Record<string, unknown>) => { ext: string; mime: string };
}

const IMAGE_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const VIDEO_MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm" };
const AUDIO_MIME: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4" };

function imageOut(params: Record<string, unknown>) {
  const ext = typeof params["format"] === "string" && params["format"] in IMAGE_MIME ? (params["format"] as string) : "jpg";
  return { ext, mime: IMAGE_MIME[ext]! };
}
function videoOut(params: Record<string, unknown>) {
  const ext = typeof params["format"] === "string" && params["format"] in VIDEO_MIME ? (params["format"] as string) : "mp4";
  return { ext, mime: VIDEO_MIME[ext]! };
}
function audioOut(params: Record<string, unknown>) {
  const ext = typeof params["format"] === "string" && params["format"] in AUDIO_MIME ? (params["format"] as string) : "wav";
  return { ext, mime: AUDIO_MIME[ext]! };
}

export const MEDIA_TASKS: Record<string, MediaTaskDefinition> = {
  create_thumbnail: {
    type: "create_thumbnail",
    label: "Create thumbnail",
    description: "A still poster frame, sized for fast previews.",
    accepts: ["image", "video"],
    outputKind: "image",
    outputCount: () => 1,
    output: imageOut,
  },
  extract_frames: {
    type: "extract_frames",
    label: "Extract frames",
    description: "Evenly spaced stills from a video, usable as references.",
    accepts: ["video"],
    outputKind: "image",
    outputCount: (params) => {
      const times = params["times_seconds"];
      if (Array.isArray(times) && times.length) return Math.min(24, times.length);
      const count = Number(params["count"] ?? 4);
      return Math.min(24, Math.max(1, Math.round(count)));
    },
    output: () => ({ ext: "jpg", mime: "image/jpeg" }),
  },
  trim_video: {
    type: "trim_video",
    label: "Trim video",
    description: "Cut a section out of a clip.",
    accepts: ["video"],
    outputKind: "video",
    outputCount: () => 1,
    output: videoOut,
  },
  transcode_video: {
    type: "transcode_video",
    label: "Transcode",
    description: "Re-encode to another size, frame rate or format.",
    accepts: ["video"],
    outputKind: "video",
    outputCount: () => 1,
    output: videoOut,
  },
  reframe_video: {
    type: "reframe_video",
    label: "Reframe",
    description: "Produce another aspect ratio, e.g. a 9:16 cut of a landscape master.",
    accepts: ["video"],
    outputKind: "video",
    outputCount: () => 1,
    output: videoOut,
  },
  resize_image: {
    type: "resize_image",
    label: "Resize image",
    description: "Scale or re-frame a still.",
    accepts: ["image"],
    outputKind: "image",
    outputCount: () => 1,
    output: imageOut,
  },
  extract_audio: {
    type: "extract_audio",
    label: "Extract audio",
    description: "Pull the audio track out of a clip.",
    accepts: ["video"],
    outputKind: "audio",
    outputCount: () => 1,
    output: audioOut,
  },
  add_audio: {
    type: "add_audio",
    label: "Add audio",
    description: "Lay an audio track over a clip.",
    accepts: ["video"],
    extraSources: [{ role: "audio", accepts: ["audio"] }],
    outputKind: "video",
    outputCount: () => 1,
    output: videoOut,
  },
  assemble_video: {
    type: "assemble_video",
    label: "Assemble",
    description: "Join clips in order, with optional trims, cross-fades and a music bed.",
    accepts: ["video"],
    outputKind: "video",
    outputCount: () => 1,
    output: videoOut,
  },
};

export const MEDIA_TASK_TYPES = Object.keys(MEDIA_TASKS);

export function mediaTasksFor(assetType: MediaKind): MediaTaskDefinition[] {
  return Object.values(MEDIA_TASKS).filter((task) => task.accepts.includes(assetType));
}
