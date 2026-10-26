// Draws As One (film.py's page, gl.js and film.js) frame by frame in Chromium and keeps it as a lossless reference.
//   node scripts/aurixa-teaser/as-one/render.cjs <film dir> <out dir>
//   RENDER_FRAMES=0,600,1200 node ... <film dir> <out dir>      # those frames, to PNG
//   RENDER_SCALE=1 RENDER_N=1 RENDER_SETTLE=0 node ...           # a quick look at all of it
// The world is drawn by WebGL at the frame's size; each frame is the average of its samples spread over a
// 180-degree shutter, each sample moved by a fraction of a pixel (film.js's setT), so its motion is blurred and its
// edges smoothed in the one drawing. The words are drawn by the page at twice the frame's size (RENDER_SCALE), and the
// whole is scaled down by FFmpeg. Each frame is kept once two captures of it in a row agree (Chromium can hand back a
// capture before every tile is painted). RENDER_WORKERS processes (default 2) each draw a run of frames into
// out/part-<k>.mkv (FFV1, RGB, 1080 x 1920); the runs are joined into out/reference.mkv, with out/render.json.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FPS = 30;
const LENGTH = 45.5;
const FRAMES = Math.round(LENGTH * FPS);
const SS = Number(process.env.RENDER_SCALE || 2);
const WIDTH = 1080;
const HEIGHT = 1920;
const SHUTTER = 0.5 / FPS;
const WORKERS = Number(process.env.RENDER_WORKERS || 2);
const RECYCLE = Number(process.env.RENDER_RECYCLE || 60);

/** How many samples a frame at t takes: four everywhere (its edges), more where things move fast. */
const SAMPLES = (() => {
  const runs = [
    [5.4, 9.6, 6], // the panes snap in
    [12.1, 13.9, 6], // they turn and go
    [22.2, 22.9, 8], // the drop
    [27.6, 33.9, 8], // the pulse and the tags following it
    [33.35, 33.9, 8], // "one"
    [40.15, 41.7, 6], // the letters rise
  ];
  return (t) => {
    let n = 4;
    for (const [a, b, k] of runs) if (t >= a && t < b) n = Math.max(n, k);
    return n;
  };
})();
const samplesAt = (f) => Number(process.env.RENDER_N || 0) || SAMPLES(f / FPS);

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}
function pngCodec() {
  try {
    return require("playwright-core/lib/utilsBundle").PNG;
  } catch {
    return require("/opt/node-tools/node_modules/playwright-core/lib/utilsBundle").PNG;
  }
}

const LAUNCH = {
  args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--enable-unsafe-swiftshader",
    "--run-all-compositor-stages-before-draw"],
};
const SETTLE_TRIES = 6;
const JITTER = 16;
const SETTLED = { retried: 0, jitter: 0, unsettled: [], captures: 0 };

async function settle(capture, pause, f) {
  let a = await capture();
  if (process.env.RENDER_SETTLE === "0") return Buffer.from(a, "base64");
  const seen = [a];
  for (let i = 0; i < SETTLE_TRIES; i++) {
    await pause();
    const b = await capture();
    if (a === b || b === seen.at(-2)) {
      if (i) SETTLED.retried++;
      return Buffer.from(b, "base64");
    }
    const PNG = pngCodec();
    const x = PNG.sync.read(Buffer.from(a, "base64")).data;
    const y = PNG.sync.read(Buffer.from(b, "base64")).data;
    let within = x.length === y.length;
    for (let k = 0; within && k < x.length; k++) if (Math.abs(x[k] - y[k]) > JITTER) within = false;
    if (within) {
      SETTLED.jitter++;
      return Buffer.from(b, "base64");
    }
    a = b;
    seen.push(b);
  }
  SETTLED.unsettled.push(f);
  console.error(`frame ${f}: still changing after ${SETTLE_TRIES + 1} captures`);
  return Buffer.from(a, "base64");
}

async function openFilm(filmHtml) {
  const { chromium } = playwright();
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SS });
  const tab = await ctx.newPage();
  const errors = [];
  tab.on("pageerror", (e) => errors.push(String(e)));
  tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await tab.goto("file://" + filmHtml, { waitUntil: "load" });
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await window.setT(0, { n: 1 });
  });
  if (errors.length) throw new Error(`the film's page reported: ${errors.join(" | ")}`);
  const cdp = await ctx.newCDPSession(tab);
  const capture = async () => {
    SETTLED.captures++;
    return (await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SS } })).data;
  };
  const twoFrames = () => tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { browser, tab, capture, twoFrames, errors };
}

async function drawFrames(filmHtml, frames, sink, label = "") {
  const PNG = pngCodec();
  let film = await openFilm(filmHtml);
  let drawn = 0;
  const started = Date.now();
  for (const f of frames) {
    if (drawn && drawn % RECYCLE === 0) {
      await film.browser.close();
      film = await openFilm(filmHtml);
    }
    await film.tab.evaluate(([t, n, sh]) => window.setT(t, { n, shutter: sh }), [f / FPS, samplesAt(f), SHUTTER]);
    const png = await settle(film.capture, film.twoFrames, f);
    const { data, width, height } = PNG.sync.read(png);
    if (width !== WIDTH * SS || height !== HEIGHT * SS) throw new Error(`frame ${f} came out ${width} x ${height}`);
    if (film.errors.length) throw new Error(`frame ${f}: the page reported ${film.errors.join(" | ")}`);
    await sink(f, data);
    drawn++;
    if (drawn % 30 === 0) console.log(`${label}${drawn}/${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  await film.browser.close();
}

function ffmpegFromRaw(outArgs) {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${WIDTH * SS}x${HEIGHT * SS}`,
    "-r", String(FPS), "-i", "pipe:0", "-vf", `format=gbrp,zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos,format=gbrp`, ...outArgs],
  { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return {
    write: (buf) => new Promise((resolve, reject) => ff.stdin.write(buf, (e) => (e ? reject(e) : resolve()))),
    end: async () => {
      ff.stdin.end();
      await closed;
    },
  };
}

async function part(filmHtml, out, k, first, last) {
  const frames = Array.from({ length: last - first }, (_, i) => first + i);
  const enc = ffmpegFromRaw(["-c:v", "ffv1", "-level", "3", "-g", "1", "-slices", "4", "-slicecrc", "1", path.join(out, `part-${k}.mkv`)]);
  await drawFrames(filmHtml, frames, (f, rgba) => enc.write(rgba), `part ${k}: `);
  await enc.end();
  fs.writeFileSync(path.join(out, `part-${k}.json`), JSON.stringify({ first, last, ...SETTLED }));
}

async function stills(filmHtml, out, only) {
  await drawFrames(filmHtml, only, async (f, rgba) => {
    const file = path.join(out, `frame-${String(f).padStart(4, "0")}.png`);
    const enc = ffmpegFromRaw(["-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", file]);
    await enc.write(rgba);
    await enc.end();
    console.log(`frame ${f} (${(f / FPS).toFixed(3)} s) → ${file}`);
  });
}

async function full(filmHtml, out) {
  const cost = Array.from({ length: FRAMES }, (_, f) => samplesAt(f) + 2);
  const total = cost.reduce((a, b) => a + b, 0);
  const bounds = [0];
  let sum = 0;
  for (let f = 0; f < FRAMES; f++) {
    sum += cost[f];
    if (bounds.length < WORKERS && sum >= (total * bounds.length) / WORKERS) bounds.push(f + 1);
  }
  bounds.push(FRAMES);
  const started = Date.now();
  await Promise.all(bounds.slice(0, -1).map((first, k) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--part", String(k), String(first), String(bounds[k + 1]), filmHtml, out], { stdio: "inherit" });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`part ${k} exited ${code}`))));
  })));
  const list = path.join(out, "parts.txt");
  fs.writeFileSync(list, bounds.slice(0, -1).map((_, k) => `file '${path.join(out, `part-${k}.mkv`)}'`).join("\n") + "\n");
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(out, "reference.mkv")], { stdio: "inherit" });
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg concat exited ${code}`))));
  });
  const parts = bounds.slice(0, -1).map((_, k) => JSON.parse(fs.readFileSync(path.join(out, `part-${k}.json`), "utf8")));
  const report = { fps: FPS, frames: FRAMES, scale: SS, shutter: SHUTTER, samples: cost.reduce((a, b) => a + b - 2, 0), parts,
    seconds: Math.round((Date.now() - started) / 1000) };
  fs.writeFileSync(path.join(out, "render.json"), JSON.stringify(report, null, 1));
  for (const k of bounds.slice(0, -1).keys()) fs.rmSync(path.join(out, `part-${k}.mkv`));
  console.log(`${FRAMES} frames → ${path.join(out, "reference.mkv")} in ${report.seconds} s`);
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === "--part") {
    const [, k, first, last, filmHtml, out] = argv;
    await part(filmHtml, out, Number(k), Number(first), Number(last));
    return;
  }
  const filmHtml = path.resolve(argv[0], "film.html");
  const out = path.resolve(argv[1]);
  fs.mkdirSync(out, { recursive: true });
  const only = process.env.RENDER_FRAMES?.split(",").filter(Boolean).map(Number);
  if (only) await stills(filmHtml, out, only);
  else await full(filmHtml, out);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
