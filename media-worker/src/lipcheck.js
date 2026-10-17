import { existsSync } from "node:fs";
import { join } from "node:path";
import { run } from "./ffmpeg.js";
import { TaskError } from "./net.js";

/**
 * How well a clip's lips follow its voice, seen in its picture: SyncNet
 * (lipcheck/syncnet_score.py, run in its own Python) scores the mouth against
 * the sound at every offset up to fifteen frames either way, for the whole
 * clip and in windows of a few seconds. From the same face landmarks it also
 * reports the clip's framing (the eye span and where the face sits) and how
 * often the mouth is open where the voice is silent (lipcheck/face_qc.py). The app keeps the score with the
 * clip, takes out a lead of a frame or two when it lays the clip, and makes
 * a poor take again (see src/lib/lip-sync/lip-check.ts).
 *
 * Optional: the image has it only when built with LIP_CHECK=1 (the default),
 * and a worker without its files doesn't offer it ("lip_check" missing from
 * its features), so the app goes on without scores.
 */

const DIR = process.env["LIP_CHECK_DIR"] ?? "/opt/lipcheck";
const PYTHON = process.env["LIP_CHECK_PYTHON"] ?? join(DIR, "venv", "bin", "python");
export { DIR as lipCheckDir, PYTHON as lipCheckPython };
const SCRIPT = join(DIR, "syncnet_score.py");
const FILES = [PYTHON, SCRIPT, join(DIR, "face_qc.py"), join(DIR, "syncnet", "SyncNetModel.py"), join(DIR, "syncnet", "syncnet_v2.model"), join(DIR, "models", "face_landmarker.task")];

/** Whether this worker has what scoring lips needs (checked once, at start). */
export const lipCheckAvailable = FILES.every((file) => existsSync(file));

/** The longest a scoring may take: a minute of clip scores in about two on four cores. */
const LIP_CHECK_TIMEOUT_SECONDS = 600;

export async function lipCheck({ sources, params }) {
  if (!lipCheckAvailable) throw new TaskError("INVALID_TASK", "This media service can't score lips (lip_check is not installed)");
  const video = sources.find((source) => source.role === "video") ?? sources[0];
  const audio = sources.find((source) => source.role === "audio") ?? null;
  if (!video) throw new TaskError("INVALID_PARAMETERS", "lip_check needs a clip");
  const duration = Number(params?.duration_seconds);
  const window = Number(params?.window_seconds);
  const args = ["-I", SCRIPT, "--json", "--video", video.path];
  if (audio && audio !== video) args.push("--audio", audio.path);
  if (Number.isFinite(duration) && duration > 0.5 && duration <= 600) args.push("--duration", duration.toFixed(3));
  if (Number.isFinite(window) && window >= 1 && window <= 30) args.push("--window", window.toFixed(2));
  const { stdout } = await run(PYTHON, args, { timeoutSeconds: LIP_CHECK_TIMEOUT_SECONDS });
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
  let report;
  try {
    report = JSON.parse(line);
  } catch {
    throw new TaskError("RENDER_FAILED", "The lip score couldn't be read");
  }
  if (!report || typeof report !== "object" || typeof report.status !== "string")
    throw new TaskError("RENDER_FAILED", "The lip score couldn't be read");
  return { outputs: [], metadata: report };
}
