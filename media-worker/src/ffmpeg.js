import { spawn } from "node:child_process";
import { config } from "./config.js";
import { TaskError } from "./net.js";
import { enterWorkspace } from "./workspace.js";

/**
 * FFmpeg is only ever invoked with an argument array the worker builds itself.
 * No task field is ever interpolated into a shell command, and no task may
 * supply raw FFmpeg arguments.
 */
export async function run(binary, args, options = {}) {
  // A task's processes start only while its workspace has room, and are
  // stopped if it runs out.
  const track = await enterWorkspace();
  return spawned(binary, args, options, track);
}

function spawned(binary, args, { timeoutSeconds = config.taskTimeoutSeconds, onStdoutLine } = {}, track) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
      reject(new TaskError("INVALID_PARAMETERS", "Internal argument construction error"));
      return;
    }

    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    track(child);
    let stdout = "";
    let stderr = "";
    let pending = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new TaskError("TASK_TIMEOUT", `${binary} exceeded ${timeoutSeconds}s and was stopped`));
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
      if (onStdoutLine) {
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          try {
            onStdoutLine(line.trim());
          } catch {
            /* a progress listener never breaks a render */
          }
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new TaskError("WORKER_ERROR", `${binary} is not available in this image`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new TaskError("RENDER_FAILED", `${binary} failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`));
    });
  });
}

/**
 * Runs FFmpeg. With `onProgress`, FFmpeg reports how much output it has
 * written (in seconds of media) as it goes.
 */
export function ffmpeg(args, { onProgress, ...options } = {}) {
  if (!onProgress) return run("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], options);
  return run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...args], {
    ...options,
    onStdoutLine: (line) => {
      const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line);
      if (match) onProgress(Number(match[1]) / 1_000_000);
    },
  });
}

export async function probe(filePath) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { timeoutSeconds: 60 },
  );
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new TaskError("RENDER_FAILED", "Media could not be inspected");
  }
  const video = (parsed.streams ?? []).find((stream) => stream.codec_type === "video");
  const audio = (parsed.streams ?? []).find((stream) => stream.codec_type === "audio");
  return {
    duration_seconds: Number(parsed.format?.duration ?? video?.duration ?? 0) || null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: video?.avg_frame_rate && video.avg_frame_rate !== "0/0" ? evaluateRate(video.avg_frame_rate) : null,
    has_audio: Boolean(audio),
    video_codec: video?.codec_name ?? null,
    audio_codec: audio?.codec_name ?? null,
    format: parsed.format?.format_name ?? null,
    size_bytes: Number(parsed.format?.size ?? 0) || null,
  };
}

function evaluateRate(rate) {
  const [num, den] = String(rate).split("/").map(Number);
  if (!den) return num || null;
  return Number((num / den).toFixed(3));
}

export async function ffmpegVersion() {
  try {
    const { stdout } = await run("ffmpeg", ["-version"], { timeoutSeconds: 20 });
    return stdout.split("\n")[0] ?? "unknown";
  } catch {
    return null;
  }
}
