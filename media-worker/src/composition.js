import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { ffmpeg, probe, run } from "./ffmpeg.js";
import { sfntKind } from "./fonts.js";
import { TaskError } from "./net.js";
import { enterWorkspace } from "./workspace.js";
import { launchChromium, openPage } from "./chromium.js";

/**
 * Compositions: code-driven motion graphics, drawn as a camera would draw them
 * (after Reel 1's renderer, scripts/aurixa-reel-1/render.cjs).
 *
 * The app sends a composition as data: its page (one HTML document) and its
 * track (every drawing's style changes, in order), which it worked out from
 * the composition's template. The worker never runs code from an edit: it
 * loads the page in Chromium, answers the page's requests with the files the
 * task brought (and refuses anything else), applies each drawing's changes
 * and captures it.
 *
 * Each frame is the average of its drawings, spread over the shutter (eight
 * at 180 degrees for a final render), each drawn at up to twice the frame's
 * size and scaled down with Lanczos; a drawing that changes nothing reuses the
 * one before. The frames are kept losslessly (FFV1, RGB) as the master the
 * edit's render uses and the reference the master is measured against, with
 * a playable copy (H.264, BT.709) and a poster for the Editor.
 *
 * A long composition is drawn in stretches (from_frame, to_frame), on as many
 * workers as there are, each a lossless piece, then joined frame for frame
 * (join_stretches), so a change draws only the stretches it touches.
 */

const ORIGIN = "https://composition.local";
export const COMPOSITION_LIMITS = {
  frames: 3600,
  pixels: 3840 * 3840 * 4,
  htmlBytes: 8 * 1024 * 1024,
  selectors: 4000,
  selectorLength: 400,
  stretches: 64,
};
const FPS_VALUES = new Set([24, 25, 30, 60]);

function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

const isInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/**
 * A composition's bundle, checked field by field (nothing in it is trusted:
 * its shape, its numbers, the size of what it asks to draw).
 */
export function readBundle(text) {
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw bad("The composition isn't readable");
  }
  if (!bundle || typeof bundle !== "object" || bundle.format !== "xeno-composition" || bundle.version !== 1)
    throw bad("That isn't a composition this media service can draw");
  const { width, height, fps, frames, settings } = bundle;
  if (!isInteger(width, 64, 3840) || !isInteger(height, 64, 3840) || width % 2 || height % 2)
    throw bad("A composition's frame must be between 64 and 3840 pixels, in even numbers");
  if (!FPS_VALUES.has(fps)) throw bad("A composition's frame rate must be 24, 25, 30 or 60");
  if (!isInteger(frames, 1, COMPOSITION_LIMITS.frames)) throw bad(`A composition may run at most ${COMPOSITION_LIMITS.frames} frames`);
  if (!settings || typeof settings !== "object") throw bad("The composition has no drawing settings");
  const scale = settings.scale;
  const drawings = settings.drawings;
  if (scale !== 1 && scale !== 2) throw bad("A composition is drawn at 1 or 2 times its size");
  if (![1, 2, 4, 8].includes(drawings)) throw bad("A frame is the average of 1, 2, 4 or 8 drawings");
  if (!isInteger(settings.shutter, 0, 360)) throw bad("The shutter is between 0 and 360 degrees");
  if (width * height * scale * scale > COMPOSITION_LIMITS.pixels) throw bad("That composition is too large to draw");
  if (typeof bundle.html !== "string" || !bundle.html.length || Buffer.byteLength(bundle.html) > COMPOSITION_LIMITS.htmlBytes)
    throw bad("The composition's page is missing or too large");
  const strings = (value, name, max) => {
    if (!Array.isArray(value) || value.length > max || value.some((entry) => typeof entry !== "string"))
      throw bad(`The composition's ${name} aren't readable`);
    return value;
  };
  strings(bundle.images, "images", 64);
  strings(bundle.fonts, "fonts", 24);
  strings(bundle.selectors, "selectors", COMPOSITION_LIMITS.selectors);
  if (bundle.selectors.some((selector) => !selector.length || selector.length > COMPOSITION_LIMITS.selectorLength))
    throw bad("A selector in the composition is empty or too long");
  if (!Array.isArray(bundle.drawings) || bundle.drawings.length !== frames * drawings)
    throw bad("The composition's track doesn't have a drawing for every frame");
  return bundle;
}

/** One drawing's changes, checked: [selector index, element index (-1: the first), {property: text}]. */
function drawingAt(bundle, index) {
  const entry = bundle.drawings[index];
  if (entry === 0) return null;
  if (!Array.isArray(entry)) throw bad(`Drawing ${index + 1} of the composition isn't readable`);
  for (const update of entry) {
    if (
      !Array.isArray(update) ||
      update.length !== 3 ||
      !isInteger(update[0], 0, bundle.selectors.length - 1) ||
      !Number.isInteger(update[1]) ||
      update[1] < -1 ||
      !update[2] ||
      typeof update[2] !== "object" ||
      Object.entries(update[2]).some(([name, value]) => typeof name !== "string" || typeof value !== "string")
    )
      throw bad(`Drawing ${index + 1} of the composition isn't readable`);
  }
  return entry;
}

/** Changes merged in order, as one: what a page must apply to catch up on drawings it didn't draw. */
export function mergeDrawings(changes) {
  const merged = new Map();
  for (const updates of changes) {
    if (!updates) continue;
    for (const [selector, index, props] of updates) {
      const key = `${selector}:${index}`;
      const item = merged.get(key) ?? [selector, index, {}];
      Object.assign(item[2], props);
      merged.set(key, item);
    }
  }
  return [...merged.values()];
}

/** The range of frames a task draws: all of them, or a stretch. */
export function frameRange(params, frames) {
  const from = params.from_frame === undefined || params.from_frame === null ? 0 : Number(params.from_frame);
  const to = params.to_frame === undefined || params.to_frame === null ? frames : Number(params.to_frame);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > frames || to <= from)
    throw bad("from_frame and to_frame must name a run of the composition's frames");
  return { from, to };
}

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

let zscaleChecked = null;
/** Whether this FFmpeg has zscale (zimg): the reel's scaler and its BT.709 conversion with error-diffusion dither. */
export function hasZscale() {
  zscaleChecked ??= run("ffmpeg", ["-hide_banner", "-filters"], { timeoutSeconds: 30 })
    .then(({ stdout }) => /\bzscale\b/.test(stdout))
    .catch(() => false);
  return zscaleChecked;
}

/**
 * The filter that makes frames from drawings: each drawing in RGB, scaled to
 * the frame with Lanczos, the frame's drawings averaged (the shutter), and the
 * frames at the composition's rate.
 */
export function shutterFilter({ width, height, scale, drawings, fps, zscale }) {
  const steps = ["format=gbrp"];
  if (scale > 1) steps.push(zscale ? `zscale=w=${width}:h=${height}:filter=lanczos` : `scale=${width}:${height}:flags=lanczos`);
  if (drawings > 1)
    steps.push(`tmix=frames=${drawings}`, `select='eq(mod(n\\,${drawings})\\,${drawings - 1})'`, `setpts=N/(${fps}*TB)`);
  return steps.join(",");
}

/**
 * The playable copy: BT.709 in the TV range, by zimg with error-diffusion
 * dither where it has it (so the brand's gradients don't band), x264 High.
 */
export function proxyChain(zscale) {
  return zscale
    ? "zscale=rangein=full:primariesin=709:transferin=709:matrix=709:primaries=709:transfer=709:range=limited:dither=error_diffusion,format=yuv420p"
    : "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
}

const PROXY_ENCODING = [
  "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  "-movflags", "+faststart",
];
// FFV1 keeps 8-bit RGB as bgr0: the same pixels as the drawings, losslessly.
const MASTER_ENCODING = ["-c:v", "ffv1", "-level", "3", "-g", "1", "-pix_fmt", "bgr0"];

/** An FFmpeg process taking PNG drawings on its input, in the task's workspace. */
async function startEncoder(args) {
  const track = await enterWorkspace();
  const child = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args], {
    stdio: ["pipe", "ignore", "pipe"],
    shell: false,
  });
  track(child);
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });
  const finished = new Promise((resolve, reject) => {
    child.on("error", () => reject(new TaskError("WORKER_ERROR", "ffmpeg is not available in this image")));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new TaskError("RENDER_FAILED", `ffmpeg failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`)),
    );
  });
  // A failure surfaces when the encoder is finished; meanwhile it mustn't go unhandled.
  finished.catch(() => {});
  return {
    write: (buffer) =>
      new Promise((resolve, reject) => {
        if (!child.stdin.writable) {
          reject(new TaskError("RENDER_FAILED", `ffmpeg stopped: ${stderr.trim().split("\n").at(-1) ?? ""}`));
          return;
        }
        child.stdin.write(buffer, (error) => (error ? reject(new TaskError("RENDER_FAILED", "ffmpeg stopped taking frames")) : resolve()));
      }),
    end: async () => {
      child.stdin.end();
      await finished;
    },
    kill: () => child.kill("SIGKILL"),
  };
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

/** What the page asks for, answered from the task's own files (the bundle's page, its images, its fonts). */
async function pageFiles(bundle, sources) {
  const images = sources.filter((source) => source.role === "image");
  const fonts = sources.filter((source) => source.role === "font");
  if (images.length !== bundle.images.length) throw bad("The composition's images weren't all sent");
  if (fonts.length !== bundle.fonts.length) throw bad("The composition's fonts weren't all sent");
  const files = new Map([["/", { body: Buffer.from(bundle.html, "utf8"), type: "text/html; charset=utf-8" }]]);
  for (const [index, image] of images.entries()) {
    const body = await readFile(image.path);
    files.set(`/image/${index}`, { body, type: imageType(body, image.mime) });
  }
  for (const [index, font] of fonts.entries()) {
    const body = await readFile(font.path);
    const kind = sfntKind(body);
    if (!kind) throw bad(`Font ${index + 1} of the composition isn't a TrueType or OpenType file`);
    files.set(`/font/${index}`, { body, type: kind === "otf" ? "font/otf" : "font/ttf" });
  }
  return (path) => files.get(path) ?? null;
}

/** An image's type by its bytes (what the app called it is only a hint). */
function imageType(body, hint) {
  if (body[0] === 0x89 && body[1] === 0x50) return "image/png";
  if (body[0] === 0xff && body[1] === 0xd8) return "image/jpeg";
  if (body.slice(0, 4).toString("latin1") === "RIFF" && body.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (body.slice(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(hint ?? "")) return hint;
  return "application/octet-stream";
}

/**
 * Draws frames [from, to) on `browsers` pages side by side and hands each
 * frame's drawings (PNG) to `sink`, in frame order. Each page catches up on
 * the drawings others drew before its own, so every frame is exactly its
 * track's state. Returns how many drawings were captured, reused and the
 * time a capture took.
 */
async function drawFrames({ bundle, serve, from, to, browsers, gpu, sink, progress, stallMs }) {
  const { width, height, fps } = bundle;
  const { scale, drawings: perFrame } = bundle.settings;
  const total = to - from;
  const done = new Map();
  let next = from;
  let captured = 0;
  let reused = 0;
  let captureMs = 0;
  let failure = null;
  let version = null;
  let lastDelivered = Date.now();
  const deliver = async () => {
    while (next < to && done.has(next)) {
      const pngs = done.get(next);
      done.delete(next);
      await sink(next, pngs);
      next += 1;
      lastDelivered = Date.now();
      progress?.((next - from) / total, `Drawing frame ${next - from} of ${total}`);
    }
  };
  const worker = async (lane) => {
    const browser = await launchChromium({ gpu });
    version ??= browser.version;
    try {
      const page = await openPage(browser, { width, height, scale, origin: ORIGIN, serve });
      // Where this page's state stands: every drawing up to `applied` (exclusive) is on it.
      let applied = 0;
      let previous = null;
      for (let frame = from + lane; frame < to && !failure; frame += browsers) {
        const first = frame * perFrame;
        // Catch up on the drawings drawn elsewhere since this page's last.
        const catchUp = [];
        for (let index = applied; index < first; index += 1) catchUp.push(drawingAt(bundle, index));
        let pending = mergeDrawings(catchUp);
        const pngs = [];
        for (let j = 0; j < perFrame; j += 1) {
          const own = drawingAt(bundle, first + j);
          const updates = mergeDrawings([pending, own]);
          pending = [];
          if (previous && !updates.length) {
            pngs.push(previous);
            reused += 1;
            continue;
          }
          await page.apply(bundle.selectors, updates);
          const started = Date.now();
          previous = await page.capture();
          captureMs += Date.now() - started;
          captured += 1;
          pngs.push(previous);
        }
        applied = first + perFrame;
        done.set(frame, pngs);
        // Not too far ahead of the frame the encoder waits for.
        while (frame - next > browsers * 6 && !failure) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await page.close();
    } finally {
      await browser.close();
    }
  };
  const lanes = Array.from({ length: Math.min(browsers, total) }, (_, lane) =>
    worker(lane).catch((error) => {
      failure ??= error;
    }),
  );
  let finished = false;
  const all = Promise.all(lanes).then(() => {
    finished = true;
  });
  while (next < to) {
    await deliver();
    if (failure) break;
    if (next >= to) break;
    if (finished && !done.has(next)) {
      failure = new TaskError("COMPOSITION_FAILED", `Frame ${next} was never drawn`);
      break;
    }
    if (Date.now() - lastDelivered > stallMs) {
      failure = new TaskError("TASK_STALLED", `No frame was drawn for ${Math.round(stallMs / 1000)}s, so the composition was stopped`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  await all;
  if (failure) throw failure;
  return { captured, reused, captureMs, chromium: version };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

/**
 * render_composition: sources are the bundle (role "data"), then its images
 * ("image") and fonts ("font") in the bundle's order. `output` "full" makes
 * the master, the playable copy and a poster; "stretch" makes the master of
 * frames [from_frame, to_frame) alone, to be joined.
 */
export async function renderComposition({ sources, params, dir, progress = () => {} }) {
  const data = sources.find((source) => source.role === "data") ?? sources[0];
  const bundle = readBundle(await readFile(data.path, "utf8"));
  if (bundle.webgl && !config.gpu)
    console.log(JSON.stringify({ event: "composition_webgl_in_software", frames: bundle.frames }));
  const output = params.output === "stretch" ? "stretch" : "full";
  const { from, to } = frameRange(params, bundle.frames);
  const serve = await pageFiles(bundle, sources.filter((source) => source !== data));
  const zscale = await hasZscale();
  const { width, height, fps } = bundle;
  const { scale, drawings } = bundle.settings;
  const filter = shutterFilter({ width, height, scale, drawings, fps, zscale });
  const master = join(dir, output === "stretch" ? `stretch-${from}.mkv` : "master.mkv");
  const proxy = join(dir, "composition.mp4");
  const poster = join(dir, "poster.jpg");
  const input = ["-f", "image2pipe", "-framerate", String(fps * drawings), "-c:v", "png", "-i", "pipe:0"];
  const graph =
    output === "stretch"
      ? `[0:v]${filter}[ref]`
      : `[0:v]${filter},split=2[ref][show];[show]${proxyChain(zscale)}[proxy]`;
  const encoder = await startEncoder([
    ...input,
    "-filter_complex", graph,
    "-map", "[ref]", ...MASTER_ENCODING, "-r", String(fps), master,
    ...(output === "stretch" ? [] : ["-map", "[proxy]", ...PROXY_ENCODING, "-r", String(fps), "-g", String(fps * 2), proxy]),
  ]);
  progress(0, "Opening the composition");
  const started = Date.now();
  let counts;
  try {
    counts = await drawFrames({
      bundle,
      serve,
      from,
      to,
      browsers: config.compositionBrowsers,
      gpu: config.gpu,
      sink: async (_frame, pngs) => {
        for (const png of pngs) await encoder.write(png);
      },
      progress: (fraction, stage) => progress(Math.min(0.95, fraction * 0.95), stage),
      stallMs: config.renderStallSeconds * 1000,
    });
    await encoder.end();
  } catch (error) {
    encoder.kill();
    throw error;
  }
  const metadata = {
    composition: {
      from_frame: from,
      to_frame: to,
      frames: to - from,
      fps,
      width,
      height,
      scale,
      drawings_per_frame: drawings,
      shutter: bundle.settings.shutter,
      drawings_captured: counts.captured,
      drawings_reused: counts.reused,
      seconds_per_drawing: counts.captured ? Number((counts.captureMs / counts.captured / 1000).toFixed(4)) : null,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      browsers: Math.min(config.compositionBrowsers, to - from),
      gpu: config.gpu,
      webgl: bundle.webgl === true,
      chromium: counts.chromium,
      zscale,
    },
  };
  if (output === "stretch") {
    return {
      outputs: [{ path: master, mime: "video/x-matroska", kind: "video" }],
      metadata: { ...metadata, ...(await probe(master)) },
    };
  }
  await posterOf(proxy, poster, (to - from) / fps, width);
  return {
    outputs: [
      { path: proxy, mime: "video/mp4", kind: "video" },
      { path: master, mime: "video/x-matroska", kind: "video" },
      { path: poster, mime: "image/jpeg", kind: "image" },
    ],
    metadata: { ...metadata, ...(await probe(proxy)) },
  };
}

async function posterOf(video, poster, seconds, width) {
  await ffmpeg([
    "-ss", Math.min(1, seconds / 2).toFixed(3),
    "-i", video,
    "-frames:v", "1",
    "-vf", `scale=${Math.min(720, width)}:-2`,
    "-q:v", "3",
    poster,
  ]);
}

/**
 * join_stretches: a composition's lossless stretches (role "video", in frame
 * order), joined frame for frame without re-encoding into the master, then
 * its playable copy and poster made from it.
 */
export async function joinStretches({ sources, params, dir, progress = () => {} }) {
  if (sources.length < 1 || sources.length > COMPOSITION_LIMITS.stretches)
    throw bad(`A composition is joined from 1 to ${COMPOSITION_LIMITS.stretches} stretches`);
  const fps = Number(params.fps);
  if (!FPS_VALUES.has(fps)) throw bad("fps must be 24, 25, 30 or 60");
  const expected = params.frames === undefined ? null : Number(params.frames);
  // The list is the worker's own file of its own paths: nothing from the task reaches it but their order.
  const list = join(dir, "stretches.txt");
  await writeFile(list, sources.map((source) => `file '${source.path.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  const master = join(dir, "master.mkv");
  progress(0.1, "Joining the stretches");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", master]);
  const joined = await probe(master);
  if (expected !== null) {
    const frames = Math.round((joined.video_duration_seconds ?? joined.duration_seconds ?? 0) * fps);
    if (Math.abs(frames - expected) > 1)
      throw new TaskError("RENDER_FAILED", `The stretches join to ${frames} frames, not the ${expected} the composition has`);
  }
  progress(0.4, "Making the playable copy");
  const zscale = await hasZscale();
  const proxy = join(dir, "composition.mp4");
  await ffmpeg(["-i", master, "-vf", proxyChain(zscale), ...PROXY_ENCODING, "-r", String(fps), "-g", String(fps * 2), proxy], {
    timeoutSeconds: config.renderTimeoutSeconds,
    stallSeconds: config.renderStallSeconds,
  });
  const poster = join(dir, "poster.jpg");
  await posterOf(proxy, poster, joined.duration_seconds ?? 1, joined.width ?? 1080);
  return {
    outputs: [
      { path: proxy, mime: "video/mp4", kind: "video" },
      { path: master, mime: "video/x-matroska", kind: "video" },
      { path: poster, mime: "image/jpeg", kind: "image" },
    ],
    metadata: { joined_stretches: sources.length, ...(await probe(proxy)) },
  };
}
