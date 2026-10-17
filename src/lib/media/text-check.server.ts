/**
 * The text check, run (see ./text-check): an image is read as it is; a video
 * has a few frames taken through it by the media service first, kept out of
 * the library and deleted once read. Asked again while those frames are
 * being taken, it says so ("sampling"), so a caller asks once more a few
 * seconds later. The verdict is kept with the file.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueInternalMediaTask } from "./enqueue.server";
import {
  TEXT_SAMPLE_POINTS,
  textCheckOf,
  textFindings,
  textSummary,
  textVerdict,
  type TextCheckResult,
} from "./text-check";

export type TextCheckOutcome =
  | { status: "checked"; result: TextCheckResult }
  | { status: "sampling" }
  | { status: "failed"; message: string };

type Json = Record<string, unknown>;

const SYSTEM = `You check pictures from AI image and video models for text. These models often letter signs, screens, dashboards, documents, packaging and logos with gibberish: invented characters, misspelt or nonsense words, warped or melting letters, or writing that changes between frames.

List every piece of visible text or lettering: words, numbers, labels, headings, UI text, signage, logos made of letters. For each:
- "text": what it says, as closely as you can read it, with ? for characters you can't make out;
- "where": where it is, in a few words (e.g. "laptop screen, chart title");
- "legible": true only if it is real, correctly spelt words or sensible numbers that a viewer could read without noticing anything wrong. Text too small to read counts only if it is plainly malformed shapes posing as writing; then it is not legible.

Judge lettering only. Ignore everything else about the picture. If there is no text at all, return no findings.`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          where: { type: "string" },
          legible: { type: "boolean" },
        },
        required: ["text", "where", "legible"],
      },
    },
  },
  required: ["findings"],
};

/** Reads the lettering in some pictures (signed URLs, in order). */
export async function checkPicturesForText(input: {
  urls: string[];
  /** What the pictures are, e.g. "frames 12%, 37%, 62% and 88% of the way through a video". */
  what: string;
  /** Names that may appear and are spelt so (a brand's own), so they aren't taken for misspellings. */
  expected?: string[];
  timeoutMs?: number;
}): Promise<{ ok: true; result: TextCheckResult } | { ok: false; message: string }> {
  if (!input.urls.length) return { ok: false, message: "Nothing to read" };
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route) return { ok: false, message: "No AI model is set up to check pictures" };
  const expected = (input.expected ?? []).map((name) => name.trim()).filter(Boolean);
  const answer = await route.provider.generateStructured<unknown>({
    system: SYSTEM,
    input: [
      `PICTURES: ${input.what}. Images 1 to ${input.urls.length}.`,
      expected.length
        ? `Names that may appear, spelt exactly like this: ${expected.slice(0, 20).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "text_check",
    schema: SCHEMA,
    model: route.model,
    images: input.urls,
    timeoutMs: Math.min(90_000, Math.max(5_000, input.timeoutMs ?? 60_000)),
  });
  if (!answer.ok || !answer.data)
    return { ok: false, message: answer.errorMessage ?? "The check didn't answer" };
  const findings = textFindings(answer.data);
  return {
    ok: true,
    result: {
      verdict: textVerdict(findings),
      findings,
      summary: textSummary(findings),
      frames: input.urls.length,
      model: answer.model ?? route.model,
      checkedAt: new Date().toISOString(),
    },
  };
}

async function signed(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

/** The frames a video's check task took, once it has (null while it is still going). */
async function sampledFrames(
  taskId: string,
): Promise<{ files: { bucket: string; path: string }[] } | { failed: string } | null> {
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("status,output_payload,error_message")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { failed: "The frames couldn't be taken" };
  if (["failed", "cancelled", "stalled"].includes(task.status))
    return { failed: task.error_message ?? "The frames couldn't be taken" };
  if (task.status !== "completed") return null;
  const files = ((task.output_payload ?? {}) as Json)["files"];
  return {
    files: Array.isArray(files)
      ? (files as Json[]).flatMap((file) =>
          typeof file["bucket"] === "string" && typeof file["path"] === "string"
            ? [{ bucket: file["bucket"], path: file["path"] }]
            : [],
        )
      : [],
  };
}

/**
 * Checks a library file for garbled text: an image at once, a video once its
 * frames are taken (call again while it says "sampling"). A file already
 * checked gives its verdict unless `again`.
 */
export async function checkAssetText(input: {
  assetId: string;
  userId: string;
  again?: boolean;
  expected?: string[];
}): Promise<TextCheckOutcome> {
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select(
      "id,asset_type,storage_bucket,storage_path,mime_type,duration_seconds,metadata,project_id",
    )
    .eq("id", input.assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!asset) return { status: "failed", message: "That file is no longer in the library" };
  if (asset.asset_type !== "image" && asset.asset_type !== "video")
    return { status: "failed", message: "Only pictures and videos have text to check" };
  const metadata = (asset.metadata ?? {}) as Json;
  const kept = textCheckOf(metadata);
  let round = typeof metadata["text_check_round"] === "number" ? metadata["text_check_round"] : 0;
  if (kept && !input.again) return { status: "checked", result: kept };
  if (kept && input.again) {
    // A fresh check: a new round of frames, the old verdict set aside.
    round += 1;
    delete metadata["text_check"];
    metadata["text_check_round"] = round;
    await supabaseAdmin
      .from("assets")
      .update({ metadata: metadata as never })
      .eq("id", asset.id);
  }

  let urls: string[] = [];
  let what = "one picture";
  let frames: { bucket: string; path: string }[] = [];
  if (asset.asset_type === "image") {
    const url = await signed(asset.storage_bucket, asset.storage_path);
    if (!url) return { status: "failed", message: "The picture couldn't be read" };
    urls = [url];
  } else {
    const length = Number(asset.duration_seconds) > 0.5 ? Number(asset.duration_seconds) : 4;
    const times = TEXT_SAMPLE_POINTS.map((share) =>
      Number(Math.min(length - 0.05, Math.max(0, length * share)).toFixed(3)),
    );
    const task = await enqueueInternalMediaTask({
      createdBy: input.userId,
      projectId: asset.project_id,
      taskType: "extract_frames",
      source: {
        assetId: asset.id,
        assetType: "video",
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
      },
      params: { times_seconds: times, format: "jpg", width: 1024 },
      dedupeKey: `text-check:${asset.id}:${round}`,
      output: { count: times.length, ext: "jpg", mime: "image/jpeg", kind: "image" },
      context: { text_check_asset_id: asset.id, register_outputs: false },
      notConfiguredMessage:
        "The media service is not configured, so frames can't be taken from the video to check.",
    });
    if (!task.ok) return { status: "failed", message: task.message };
    const sampled = await sampledFrames(task.taskId);
    if (!sampled) return { status: "sampling" };
    if ("failed" in sampled) return { status: "failed", message: sampled.failed };
    frames = sampled.files;
    for (const frame of frames) {
      const url = await signed(frame.bucket, frame.path);
      if (url) urls.push(url);
    }
    if (!urls.length) return { status: "failed", message: "The video's frames couldn't be read" };
    what = `${urls.length} frames taken through one video, in time order`;
  }

  const outcome = await checkPicturesForText({
    urls,
    what,
    ...(input.expected ? { expected: input.expected } : {}),
  });
  if (!outcome.ok) return { status: "failed", message: outcome.message };
  const { data: fresh } = await supabaseAdmin
    .from("assets")
    .select("metadata")
    .eq("id", asset.id)
    .maybeSingle();
  await supabaseAdmin
    .from("assets")
    .update({
      metadata: { ...((fresh?.metadata ?? metadata) as Json), text_check: outcome.result } as never,
    })
    .eq("id", asset.id);
  // The frames were only for this check.
  const byBucket = new Map<string, string[]>();
  for (const frame of frames)
    byBucket.set(frame.bucket, [...(byBucket.get(frame.bucket) ?? []), frame.path]);
  for (const [bucket, paths] of byBucket)
    await supabaseAdmin.storage
      .from(bucket)
      .remove(paths)
      .catch(() => undefined);
  return { status: "checked", result: outcome.result };
}
