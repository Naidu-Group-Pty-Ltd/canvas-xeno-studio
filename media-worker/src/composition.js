import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RENDER_TO_JPEG } from "./colour.js";
import { config } from "./config.js";
import { ffmpeg, probe, run } from "./ffmpeg.js";
import { sfntKind } from "./fonts.js";
import { TaskError } from "./net.js";
import { enterWorkspace } from "./workspace.js";
import { launchChromium, openPage } from "./chromium.js";
import { AGREEMENT, SettleRecord, framesToVerify, sameFrame, settleCapture, vote } from "./settle.js";

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
 *
 * What Reel 2 found drawing its film (./settle.js): every drawing is kept only
 * once two captures of it agree, since Chromium can hand one back a moment
 * before every tile in it is painted; each browser is started again every
 * COMPOSITION_RECYCLE_FRAMES of its frames, since a 3D scene grew one past
 * 4 GB; and a final drawing is shown free of a capture race by agreement, a
 * sample of its frames drawn again by a browser of its own, with a third
 * voting where two disagree.
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
 * A page that draws the composition's track. It moves forward through the
 * drawings, catching up on those it skips (drawn on other pages), so every
 * frame it draws is exactly its track's state; `drawFrame` gives the frame's
 * drawings (PNG), each kept once it has settled (./settle.js), and tells
 * `onDrawing` what each took.
 */
async function trackPage(browser, { bundle, serve, counts, open = openPage }) {
  const { width, height } = bundle;
  const { scale, drawings: perFrame } = bundle.settings;
  const page = await open(browser, { width, height, scale, origin: ORIGIN, serve });
  // Every drawing up to `applied` (exclusive) is on the page.
  let applied = 0;
  let previous = null;
  return {
    /** Whether this page can draw `frame`: it has not drawn past it. */
    canDraw: (frame) => frame * perFrame >= applied,
    async drawFrame(frame, onDrawing) {
      const first = frame * perFrame;
      if (first < applied) throw new TaskError("COMPOSITION_FAILED", `A page can't go back to frame ${frame}`);
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
          counts.reused += 1;
          continue;
        }
        await page.apply(bundle.selectors, updates);
        const started = Date.now();
        const outcome = await settleCapture({ capture: () => page.capture(), pause: () => page.nextFrames() });
        onDrawing(outcome, Date.now() - started);
        previous = outcome.png;
        pngs.push(previous);
      }
      applied = first + perFrame;
      return pngs;
    },
    close: () => page.close(),
  };
}

/**
 * A browser with a page on the track, started again every `recycle` frames it draws. `chrome` is how a browser is
 * started and a page opened (Chromium's, unless a test gives its own).
 */
function trackDrawer({ bundle, serve, gpu, recycle, counts, chrome }) {
  let browser = null;
  let page = null;
  let drawn = 0;
  const open = async () => {
    browser = await (chrome?.launch ?? launchChromium)({ gpu });
    counts.launches += 1;
    counts.chromium ??= browser.version;
    page = await trackPage(browser, { bundle, serve, counts, open: chrome?.open });
  };
  const shut = async () => {
    await page?.close().catch(() => {});
    await browser?.close();
    browser = null;
    page = null;
  };
  return {
    async drawFrame(frame, onDrawing) {
      if (browser && ((drawn > 0 && drawn % recycle === 0) || !page.canDraw(frame))) await shut();
      if (!browser) await open();
      drawn += 1;
      return page.drawFrame(frame, onDrawing);
    },
    close: shut,
  };
}

/**
 * A frame from its drawings (PNG), as the master is made from them (the same
 * filter: each scaled down, the shutter's average), as RGB: what two draws of
 * a frame are compared by.
 */
async function frameOf(pngs, { width, height, scale, drawings, fps, zscale }) {
  const track = await enterWorkspace();
  const filter = shutterFilter({ width, height, scale, drawings, fps, zscale });
  const child = spawn(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(fps * drawings), "-c:v", "png", "-i", "pipe:0",
      "-filter_complex", `[0:v]${filter},format=rgb24[frame]`, "-map", "[frame]",
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"], shell: false },
  );
  track(child);
  const out = [];
  let stderr = "";
  child.stdout.on("data", (chunk) => out.push(chunk));
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2000);
  });
  const finished = new Promise((resolve, reject) => {
    child.on("error", () => reject(new TaskError("WORKER_ERROR", "ffmpeg is not available in this image")));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new TaskError("RENDER_FAILED", `A frame couldn't be checked: ${stderr.trim().split("\n").at(-1) ?? ""}`)),
    );
  });
  child.stdin.on("error", () => {});
  for (const png of pngs) child.stdin.write(png);
  child.stdin.end();
  await finished;
  const frame = Buffer.concat(out);
  if (frame.length !== width * height * 3) throw new TaskError("RENDER_FAILED", "A frame couldn't be checked: it came out the wrong size");
  return frame;
}

/**
 * Draws frames [from, to) on `browsers` pages side by side and hands each
 * frame's drawings (PNG) to `sink`, in frame order. Each page catches up on
 * the drawings others drew before its own, so every frame is exactly its
 * track's state. With `verify` (a share of the frames), a frame is handed on
 * only once it has been put to the vote, where it was picked (./settle.js):
 * every frame whose drawings had to be captured again, its neighbours, and
 * that share of the rest, drawn again by a browser of its own; where the two
 * disagree a third, in another, votes, and the drawings two draws agree on
 * are the ones kept. Returns what drawing took and how it settled. `chrome`
 * (for tests) gives each drawer ("lane" n, "again", "third") its own way to
 * start a browser and open a page.
 */
export async function drawFrames({ bundle, serve, from, to, browsers, gpu, sink, progress, stallMs, recycle, verify = 0, shape, chrome }) {
  const total = to - from;
  const done = new Map();
  const settle = new SettleRecord();
  const counts = { captured: 0, reused: 0, captureMs: 0, launches: 0, chromium: null };
  let next = from;
  let failure = null;
  let lastDelivered = Date.now();
  const deliver = async (frame) => {
    const pngs = done.get(frame);
    done.delete(frame);
    await sink(frame, pngs);
    lastDelivered = Date.now();
    progress?.((frame + 1 - from) / total, `Drawing frame ${frame + 1 - from} of ${total}`);
  };
  const onDrawing = (frame) => (outcome, ms) => {
    settle.add(frame, outcome, ms);
    counts.captured += 1;
    counts.captureMs += ms;
  };
  const lane = async (index) => {
    const drawer = trackDrawer({ bundle, serve, gpu, recycle, counts, chrome: chrome?.("lane", index) });
    try {
      for (let frame = from + index; frame < to && !failure; frame += browsers) {
        done.set(frame, await drawer.drawFrame(frame, onDrawing(frame)));
        // Not too far ahead of the frame the encoder waits for.
        while (frame - next > browsers * 6 && !failure) await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      await drawer.close();
    }
  };

  // The vote: frames picked as they become known (a frame's neighbours must be drawn to know whether it is one).
  const verification = verify > 0
    ? {
        sample: new Set(framesToVerify({ from, to, share: verify, seed: `${bundle.frames}:${bundle.drawings.length}` })),
        picked: [],
        disagreed: [],
        replaced: [],
        unresolved: [],
        votes: {},
        drawings: 0,
        queued: new Set(),
        settledFrames: new Set(),
      }
    : null;
  const drawnYet = (frame) => frame < from || frame >= to || frame < next || done.has(frame);
  const picked = (frame) =>
    verification.sample.has(frame) || [frame - 1, frame, frame + 1].some((f) => settle.recaptured.has(f));
  const verifierCounts = { captured: 0, reused: 0, captureMs: 0, launches: 0, chromium: null };
  const verifier = verification ? trackDrawer({ bundle, serve, gpu, recycle, counts: verifierCounts, chrome: chrome?.("again", 0) }) : null;
  const tieBreaker = verification ? trackDrawer({ bundle, serve, gpu, recycle, counts: verifierCounts, chrome: chrome?.("third", 0) }) : null;
  const countDrawing = () => {
    verification.drawings += 1;
  };
  const putToTheVote = async (frame) => {
    verification.picked.push(frame);
    const run = done.get(frame);
    const again = await verifier.drawFrame(frame, countDrawing);
    const [a, b] = [await frameOf(run, shape), await frameOf(again, shape)];
    if (!sameFrame(a, b, shape).same) {
      verification.disagreed.push(frame);
      const third = await tieBreaker.drawFrame(frame, countDrawing);
      const draws = [
        { name: "run", frame: a, pngs: run },
        { name: "again", frame: b, pngs: again },
        { name: "third", frame: await frameOf(third, shape), pngs: third },
      ];
      const result = vote(draws, shape);
      verification.votes[String(frame)] = result.groups;
      if (result.unresolved) verification.unresolved.push(frame);
      else if (result.winner !== "run") {
        done.set(frame, draws.find((draw) => draw.name === result.winner).pngs);
        verification.replaced.push(frame);
      }
    }
    verification.settledFrames.add(frame);
  };
  let voting = Promise.resolve();
  const queueVotes = () => {
    // Frames whose neighbours are drawn, in order, each put to the vote once, one at a time.
    for (let frame = next; frame < to && done.has(frame); frame += 1) {
      if (verification.queued.has(frame) || verification.settledFrames.has(frame)) continue;
      if (!drawnYet(frame - 1) || !drawnYet(frame + 1)) break;
      if (!picked(frame)) continue;
      verification.queued.add(frame);
      voting = voting.then(() => (failure ? null : putToTheVote(frame))).catch((error) => {
        failure ??= error;
      });
    }
  };
  const ready = (frame) => {
    if (!done.has(frame)) return false;
    if (!verification) return true;
    if (!drawnYet(frame - 1) || !drawnYet(frame + 1)) return false;
    return !picked(frame) || verification.settledFrames.has(frame);
  };

  const lanes = Array.from({ length: Math.min(browsers, total) }, (_, index) =>
    lane(index).catch((error) => {
      failure ??= error;
    }),
  );
  let finished = false;
  const all = Promise.all(lanes).then(() => {
    finished = true;
  });
  try {
    while (next < to) {
      if (verification) queueVotes();
      while (next < to && ready(next) && !failure) {
        await deliver(next);
        next += 1;
      }
      if (failure || next >= to) break;
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
    await voting;
  } finally {
    await verifier?.close();
    await tieBreaker?.close();
  }
  if (failure) throw failure;
  return {
    ...counts,
    settle: settle.report(),
    verified: verification
      ? {
          share: verify,
          rule: { tolerance: AGREEMENT.tolerance, edge_level: AGREEMENT.edgeLevel, edge_px: Math.round(AGREEMENT.edgeShare * shape.width * shape.height) },
          frames: verification.picked.length,
          picked: [...verification.picked].sort((a, b) => a - b),
          disagreed: verification.disagreed.sort((a, b) => a - b),
          replaced_by_agreement: verification.replaced.sort((a, b) => a - b),
          unresolved: verification.unresolved.sort((a, b) => a - b),
          votes: verification.votes,
          drawings: verification.drawings,
          browser_launches: verifierCounts.launches,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

/**
 * render_composition: sources are the bundle (role "data"), then its images
 * ("image") and fonts ("font") in the bundle's order. `output` "full" makes
 * the master, the playable copy and a poster; "stretch" makes the master of
 * frames [from_frame, to_frame) alone, to be joined; "still" makes a one-frame
 * composition's one drawing a PNG (see renderStill). `verify` is the share of
 * frames put to the vote besides those the settle check captured again (0 to
 * 0.5; 0.05 for a final drawing unless given, none for a draft).
 */
export async function renderComposition({ sources, params, dir, progress = () => {} }) {
  const data = sources.find((source) => source.role === "data") ?? sources[0];
  const bundle = readBundle(await readFile(data.path, "utf8"));
  if (bundle.webgl && !config.gpu)
    console.log(JSON.stringify({ event: "composition_webgl_in_software", frames: bundle.frames }));
  if (params.output === "still") {
    const serve = await pageFiles(bundle, sources.filter((source) => source !== data));
    return renderStill({ bundle, serve, dir, progress });
  }
  const output = params.output === "stretch" ? "stretch" : "full";
  const { from, to } = frameRange(params, bundle.frames);
  const serve = await pageFiles(bundle, sources.filter((source) => source !== data));
  const zscale = await hasZscale();
  const { width, height, fps } = bundle;
  const { scale, drawings } = bundle.settings;
  const filter = shutterFilter({ width, height, scale, drawings, fps, zscale });
  const verify = verifyShare(params);
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
      recycle: config.compositionRecycleFrames,
      verify,
      shape: { width, height, scale, drawings, fps, zscale },
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
      browser_launches: counts.launches,
      recycle_frames: Number.isFinite(config.compositionRecycleFrames) ? config.compositionRecycleFrames : null,
      gpu: config.gpu,
      webgl: bundle.webgl === true,
      chromium: counts.chromium,
      zscale,
      // How the drawings settled (./settle.js), and how the stretch was shown free of a capture race.
      settle: counts.settle,
      verified: counts.verified,
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

/**
 * A still: a one-frame composition's one drawing, kept as the PNG the browser
 * captured at the bundle's scale (twice the frame at STILL_SETTINGS, so a
 * 1920 x 1080 frame is a 3840 x 2160 picture). It is kept once two captures of
 * it agree, as every drawing is (./settle.js); with nothing moving there is no
 * shutter to average and nothing to scale down. `draw` and `chrome` are for tests.
 */
export async function renderStill({ bundle, serve, dir, progress = () => {}, chrome, draw = drawFrames }) {
  if (bundle.frames !== 1 || bundle.settings.drawings !== 1) throw bad("A still is one frame of one drawing");
  const { width, height, fps } = bundle;
  const { scale } = bundle.settings;
  const still = join(dir, "still.png");
  const started = Date.now();
  let png = null;
  progress(0, "Opening the composition");
  const counts = await draw({
    bundle,
    serve,
    from: 0,
    to: 1,
    browsers: 1,
    gpu: config.gpu,
    sink: async (_frame, pngs) => {
      png = pngs[0] ?? null;
    },
    progress: (fraction, stage) => progress(Math.min(0.95, fraction * 0.95), stage),
    stallMs: config.renderStallSeconds * 1000,
    recycle: config.compositionRecycleFrames,
    verify: 0,
    shape: { width, height, scale, drawings: 1, fps, zscale: false },
    chrome,
  });
  if (!png) throw new TaskError("RENDER_FAILED", "The still wasn't drawn");
  await writeFile(still, png);
  return {
    outputs: [{ path: still, mime: "image/png", kind: "image" }],
    metadata: {
      width: width * scale,
      height: height * scale,
      composition: {
        still: true,
        frames: 1,
        width,
        height,
        scale,
        drawings_captured: counts.captured,
        seconds_per_drawing: counts.captured ? Number((counts.captureMs / counts.captured / 1000).toFixed(4)) : null,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        browser_launches: counts.launches,
        chromium: counts.chromium,
        gpu: config.gpu,
        webgl: bundle.webgl === true,
        settle: counts.settle,
      },
    },
  };
}

/** The share of frames put to the vote: `verify` as asked (0 to 0.5), else 0.05 for a final drawing and none for a draft. */
export function verifyShare(params) {
  const asked = params.verify;
  if (asked === undefined || asked === null || asked === "") return params.priority === "final" ? 0.05 : 0;
  const share = Number(asked);
  if (!Number.isFinite(share) || share < 0 || share > 0.5) throw bad("verify is a share of the frames, from 0 to 0.5");
  return share;
}

async function posterOf(video, poster, seconds, width) {
  await ffmpeg([
    "-ss", Math.min(1, seconds / 2).toFixed(3),
    "-i", video,
    "-frames:v", "1",
    // In a JPEG's own colour (BT.601), as viewers read it.
    "-vf", `scale=${Math.min(720, width)}:-2:${RENDER_TO_JPEG}`,
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
