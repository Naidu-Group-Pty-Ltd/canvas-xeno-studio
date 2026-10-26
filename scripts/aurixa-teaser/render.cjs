// Draws the teaser (film.py's page, moved by film.js) frame by frame in Chromium, at twice the frame's size, and
// keeps it as a lossless reference; master.sh makes the delivery master from that and the mix.
//   node scripts/aurixa-teaser/render.cjs <film dir> <out dir>
//   RENDER_FRAMES=0,170,600 node scripts/aurixa-teaser/render.cjs <film dir> <out dir>   # those frames, to PNG
//   RENDER_SCALE=1 RENDER_SUBFRAMES=1 RENDER_SETTLE=0 ...                                   # a quick look at all of it
// <film dir> holds film.html (film.py). The full run splits the 1,125 frames into RENDER_WORKERS (default 4) runs of
// about equal work, each drawn by its own process and browser into out/part-<k>.mkv (FFV1, RGB, 1080 x 1920), then
// joins them into out/reference.mkv and writes out/render.json (what each frame took).
//
// Motion is blurred as a camera's 180-degree shutter blurs it: a frame is the average of its drawings spread over the
// half of its 1/30 s the shutter is open, as Reel 3's renderer does. How many drawings a frame takes follows what
// moves in it (SUBFRAMES): eight through the dive, where the city rushes past, one where only the camera's slow
// drift moves. Every drawing is kept only once two captures of it in a row agree (Reel 3's `settle`: Chromium can
// hand back a capture before every tile in it is painted), and each browser is relaunched every RENDER_RECYCLE
// (default 40) of its frames, as the answer's 3D tilt grows a browser's memory.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FPS = 30;
const LENGTH = 37.5;
const FRAMES = Math.round(LENGTH * FPS);
const SS = Number(process.env.RENDER_SCALE || 2); // RENDER_SCALE=1: a quick look, drawn at the frame's size
const WIDTH = 1080;
const HEIGHT = 1920;
const SHUTTER = 0.5;
const WORKERS = Number(process.env.RENDER_WORKERS || 4);
const RECYCLE = Number(process.env.RENDER_RECYCLE || 40);

/** How many drawings a frame at t takes: what moves fast takes more (film.js's clock). */
const SUBFRAMES = (() => {
  const runs = [
    [0, 0.35, 1],
    [0.35, 1.5, 3], // the beam's pulse
    [1.5, 4.1, 1],
    [4.1, 5.0, 3], // the line goes, the fall begins
    [5.0, 7.45, 8], // the dive
    [7.45, 7.5, 3],
  ];
  for (const q of [7.5, 12.5, 17.5])
    runs.push([q, q + 0.9, 5], [q + 0.9, q + 2.7, 3], [q + 2.7, q + 4.2, 1], [q + 4.2, q + 5.0, 4]);
  runs.push(
    [22.5, 27.2, 2], // the gap: dashes running, lights breathing, the words
    [27.2, 29.6, 4], // the shape: the camera draws in, the edges run
    [29.6, 30.0, 2],
    [30.0, 31.9, 6], // the hit, the tilt, the rise into the orb
    [31.9, 32.2, 2],
    [32.2, 34.6, 4], // the name
    [34.6, 35.0, 1],
    [35.0, 36.7, 3],
    [36.7, 37.6, 1],
  );
  return (t) => {
    for (const [a, b, n] of runs) if (t >= a - 1e-9 && t < b - 1e-9) return n;
    return 2;
  };
})();
/** The times frame f is drawn at: evenly over its open shutter, centred on the frame. */
const subframeTimes = (f) => {
  const n = Number(process.env.RENDER_SUBFRAMES || 0) || SUBFRAMES(f / FPS); // RENDER_SUBFRAMES=1: a quick look
  return Array.from({ length: n }, (_, j) => (f + ((j + 0.5) / n - 0.5) * SHUTTER) / FPS);
};

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

// ------------------------------------------------------------------ drawing
const LAUNCH = {
  args: [
    "--allow-file-access-from-files",
    "--disable-checker-imaging",
    "--force-color-profile=srgb",
    "--run-all-compositor-stages-before-draw",
  ],
};
const SETTLE_TRIES = 6;
const JITTER = 16;
const SETTLED = { retried: 0, jitter: 0, unsettled: [], captures: 0 };

/** A drawing, kept once two captures of it in a row agree (or differ by no more than a hairline's jitter). */
async function settle(capture, pause, f) {
  let a = await capture();
  if (process.env.RENDER_SETTLE === "0") return Buffer.from(a, "base64"); // a quick look only
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
  console.error(`frame ${f}: a drawing was still changing after ${SETTLE_TRIES + 1} captures`);
  return Buffer.from(a, "base64");
}

/** A browser with the film loaded, its fonts and every picture decoded. */
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
    const urls = new Set();
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      for (const v of [cs.backgroundImage, cs.webkitMaskImage, cs.maskImage])
        for (const m of String(v).matchAll(/url\("([^"]+)"\)/g)) urls.add(m[1]);
    }
    for (const img of document.images) urls.add(img.src);
    await Promise.all(
      [...urls].map((u) => {
        const i = new Image();
        i.src = u;
        return i.decode().catch(() => null);
      }),
    );
    const broken = [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src);
    if (broken.length) throw new Error(`pictures that did not load: ${broken.join(", ")}`);
  });
  if (errors.length) throw new Error(`the film's page reported: ${errors.join(" | ")}`);
  const cdp = await ctx.newCDPSession(tab);
  const capture = async () => {
    SETTLED.captures++;
    return (
      await cdp.send("Page.captureScreenshot", {
        format: "png",
        optimizeForSpeed: true,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SS },
      })
    ).data;
  };
  const twoFrames = () => tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { browser, tab, capture, twoFrames, errors };
}

/** Draws `frames` in order, handing each (RGBA at 2x, its drawings averaged) to `sink`. */
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
    const times = subframeTimes(f);
    let acc = null;
    let only = null;
    for (const t of times) {
      await film.tab.evaluate((t) => window.setT(t), t);
      const png = await settle(film.capture, film.twoFrames, f);
      const { data, width, height } = PNG.sync.read(png);
      if (width !== WIDTH * SS || height !== HEIGHT * SS) throw new Error(`frame ${f} came out ${width} x ${height}`);
      if (times.length === 1) {
        only = data;
        break;
      }
      if (!acc) acc = new Uint16Array(data.length);
      for (let k = 0; k < data.length; k++) acc[k] += data[k];
    }
    let rgba = only;
    if (!rgba) {
      rgba = Buffer.alloc(acc.length);
      const n = times.length;
      for (let k = 0; k < acc.length; k++) rgba[k] = Math.round(acc[k] / n);
    }
    if (film.errors.length) throw new Error(`frame ${f}: the page reported ${film.errors.join(" | ")}`);
    await sink(f, rgba);
    drawn++;
    if (drawn % 30 === 0)
      console.log(`${label}${drawn}/${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  await film.browser.close();
}

/** An ffmpeg taking 2x RGBA frames on its input and writing `args`' output at the frame's size. */
function ffmpegFromRaw(outArgs) {
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${WIDTH * SS}x${HEIGHT * SS}`,
      "-r",
      String(FPS),
      "-i",
      "pipe:0",
      "-vf",
      `format=gbrp,zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos,format=gbrp`,
      ...outArgs,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const closed = new Promise((resolve, reject) =>
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))),
  );
  return {
    write: (buf) => new Promise((resolve, reject) => ff.stdin.write(buf, (e) => (e ? reject(e) : resolve()))),
    end: async () => {
      ff.stdin.end();
      await closed;
    },
  };
}

// ------------------------------------------------------------------ runs
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
  // Split the frames into WORKERS runs of about equal work (a dive frame is ten drawings, a still one one).
  const cost = Array.from({ length: FRAMES }, (_, f) => subframeTimes(f).length + 1);
  const total = cost.reduce((a, b) => a + b, 0);
  const bounds = [0];
  let sum = 0;
  for (let f = 0; f < FRAMES; f++) {
    sum += cost[f];
    if (bounds.length < WORKERS && sum >= (total * bounds.length) / WORKERS) bounds.push(f + 1);
  }
  bounds.push(FRAMES);
  const started = Date.now();
  await Promise.all(
    bounds.slice(0, -1).map(
      (first, k) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [__filename, "--part", String(k), String(first), String(bounds[k + 1]), filmHtml, out], {
            stdio: "inherit",
          });
          child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`part ${k} exited ${code}`))));
        }),
    ),
  );
  const list = path.join(out, "parts.txt");
  fs.writeFileSync(list, bounds.slice(0, -1).map((_, k) => `file '${path.join(out, `part-${k}.mkv`)}'`).join("\n") + "\n");
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", path.join(out, "reference.mkv")], { stdio: "inherit" });
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg concat exited ${code}`))));
  });
  const parts = bounds.slice(0, -1).map((_, k) => JSON.parse(fs.readFileSync(path.join(out, `part-${k}.json`), "utf8")));
  const report = {
    fps: FPS,
    frames: FRAMES,
    supersample: SS,
    shutter: SHUTTER,
    drawings: cost.reduce((a, b) => a + b - 1, 0),
    parts,
    seconds: Math.round((Date.now() - started) / 1000),
  };
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
