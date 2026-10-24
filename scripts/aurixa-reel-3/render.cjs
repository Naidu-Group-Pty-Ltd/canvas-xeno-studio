// Renders Reel 3 (BRIEF.md) as motion with Reel 1's renderer, unchanged but for its brief and scenes: each shot's
// pages and graphics animated on the brief's beats (brief.json), drawn in Chromium at twice the frame's size and
// scaled down, then encoded as the delivery master (H.264 High, 4:2:0, BT.709, 30 fps) with the voiceover. It moves
// only on the brand's own curves and durations, read from aurixa-reel.css (ease-move, ease-settle, motion-press).
// Run: node scripts/aurixa-reel-3/render.cjs <outDir> <assetsDir> <voiceover.wav> [firstShot lastShot]
//   e.g. node render.cjs out assets vo.wav 04.1 05.2
// It writes film.mp4 (the master), reference.mkv (the same frames, lossless RGB, for measuring the master
// against) and film.json (every frame: its shot, scene and caption).
// Motion is blurred as a camera's 180-degree shutter blurs it: each frame is the average of SUBFRAMES drawings
// spread over the half of its 1/30 s the shutter is open, so a fast pointer smears rather than jumps, and a still
// frame (all its drawings identical) stays exactly as sharp.
// Every drawing is kept only once two captures of it in a row agree (see `settle`).
// RENDER_WORKERS (default 3) browsers draw frames side by side, each relaunched every RENDER_RECYCLE (default 40)
// of its frames; RENDER_SUBFRAMES (default 8);
// RENDER_FRAMES=900,1100 draws just those frames to PNG, to look at.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const M = require("./motion.cjs");
const { F, KIT, CAP, BRIEF, FPS, frameOf, shotOf, RENDER_CSS } = M;

const OUT = path.resolve(process.argv[2] || "reel-3-film");
// "none" draws without sound (a stretch to look at, or a run of frames).
const VOICEOVER =
  process.argv[4] && process.argv[4] !== "none" ? path.resolve(process.argv[4]) : null;
const FIRST = process.argv[5] || "01.1";
const LAST = process.argv[6] || FIRST;
const SUPERSAMPLE = 2;
const WIDTH = KIT.FRAME.width;
const HEIGHT = KIT.FRAME.height;
const WORKERS = Number(process.env.RENDER_WORKERS || 3);
const RECYCLE = Number(process.env.RENDER_RECYCLE || 40);
const SUBFRAMES = Number(process.env.RENDER_SUBFRAMES || 8);
const SHUTTER = 0.5; // 180 degrees: open for half of each frame
/** The times a frame is drawn at: SUBFRAMES of them, evenly over the open shutter, centred on the frame. */
const subframeTimes = (f) =>
  Array.from({ length: SUBFRAMES }, (_, j) => (f + ((j + 0.5) / SUBFRAMES - 0.5) * SHUTTER) / FPS);

const SCENES = require("./scenes/index.cjs").map((scene) => {
  const shots = scene.shots.map(shotOf);
  return { ...scene, from: frameOf(shots[0].in), to: frameOf(shots.at(-1).out) };
});

// ------------------------------------------------------------------ drawing
function launchArgs() {
  return {
    ...(F.CHROMIUM ? { executablePath: F.CHROMIUM } : {}),
    // Large images are decoded before a frame is drawn, never filled in a frame later; and every compositor
    // stage (raster of every tile included) runs before a frame is drawn, so a busy machine can never capture a
    // layer with a tile still unpainted (seen once, as a black rectangle, in the third cut's depth-staged shots).
    args: [
      "--disable-checker-imaging",
      "--force-color-profile=srgb",
      "--run-all-compositor-stages-before-draw",
    ],
  };
}
/**
 * A drawing, kept once it has settled. Chromium can hand back a capture a moment before every tile in it is
 * painted, even with every compositor stage run before drawing: as the camera pushed in on the Passport's closed
 * cover (04.2), the proof's drawings caught the leaves beneath through the cover in hard-edged rectangles in
 * about half of fifty frames, and once a caption word a step behind. Which drawings it hits changes from run to
 * run, so a drawing is captured again until two captures in a row agree. Back to back, two captures can agree on
 * a stale tile (the caption's sweeping light was caught a step behind, in one push-in frame of 21), so the page
 * is given two of its own frames between them, for the painting to catch up. And a drawing can come to rest
 * alternating between two paintings (a thin rotated line in 03.1, Chromium switching between two scales of it on
 * alternate frames, never more than 9 code values apart): a capture that repeats the one before last is a steady
 * state too, which a race, being a one-off, never makes. Nor need it ever repeat: on some of the drop's drawings
 * the same line jittered on every capture, never more than 16 code values. So two captures no pixel of which is
 * more than JITTER apart are one drawing; a race is tens to hundreds of code values out, on a hole or a word.
 * RENDER_SETTLE=0 keeps the first capture (for a quick look only).
 */
const SETTLE = process.env.RENDER_SETTLE !== "0";
const SETTLE_TRIES = 6;
const JITTER = 16;
/** Playwright's own PNG codec, from wherever Playwright itself is found (frames.cjs: here, or the machine's tools). */
const utilsBundle = () => {
  try {
    return require("playwright-core/lib/utilsBundle");
  } catch {
    return require("/opt/node-tools/node_modules/playwright-core/lib/utilsBundle");
  }
};
/** Whether two captures (base64 PNG) are one drawing within a hairline's jitter. */
function withinJitter(a, b) {
  const { PNG } = utilsBundle();
  const x = PNG.sync.read(Buffer.from(a, "base64")).data;
  const y = PNG.sync.read(Buffer.from(b, "base64")).data;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > JITTER) return false;
  return true;
}
/**
 * Frames whose drawings had to be captured again before they settled (how many times), any that never did, and
 * every capture's time (the checks included), to say what settling costs.
 */
const SETTLED = { retried: new Map(), unsettled: new Set(), captures: 0, ms: 0, jitter: 0 };
/** What settling took, for film.json and the log (integer keys come out of an object in order). */
const settleReport = () => ({
  on: SETTLE,
  frames_retried: SETTLED.retried.size,
  retried: Object.fromEntries(SETTLED.retried),
  unsettled: [...SETTLED.unsettled].sort((a, b) => a - b),
  settled_within_jitter: SETTLED.jitter,
  captures: SETTLED.captures,
  capture_ms_mean: SETTLED.captures ? Math.round(SETTLED.ms / SETTLED.captures) : null,
});
/** Two of the page's own frames, before a drawing is captured again. */
const twoFrames = (tab) =>
  tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function settle(capture, pause) {
  const timed = async () => {
    const t0 = Date.now();
    const data = await capture();
    SETTLED.captures++;
    SETTLED.ms += Date.now() - t0;
    return data;
  };
  let a = await timed();
  if (!SETTLE) return { png: Buffer.from(a, "base64"), retries: 0, settled: true };
  const seen = [a];
  for (let retries = 0; retries < SETTLE_TRIES; retries++) {
    await pause();
    const b = await timed();
    if (a === b || b === seen.at(-2))
      return { png: Buffer.from(b, "base64"), retries, settled: true };
    if (withinJitter(a, b)) {
      SETTLED.jitter++;
      return { png: Buffer.from(b, "base64"), retries, settled: true };
    }
    a = b;
    seen.push(b);
  }
  // RENDER_SETTLE_DEBUG=<dir> keeps every capture of a drawing that never settled, to see what kept changing.
  return { png: Buffer.from(a, "base64"), retries: SETTLE_TRIES, settled: false, seen };
}
const SETTLE_DEBUG = process.env.RENDER_SETTLE_DEBUG;
function keepUnsettled(f, seen) {
  if (!SETTLE_DEBUG || !seen) return;
  fs.mkdirSync(SETTLE_DEBUG, { recursive: true });
  const stamp = Date.now();
  seen.forEach((data, i) =>
    fs.writeFileSync(
      path.join(SETTLE_DEBUG, `f${f}-${stamp}-${i}.png`),
      Buffer.from(data, "base64"),
    ),
  );
}
/** A scene's page: the frame (.fk) with the scene's layers; each scene draws its own ground, to fade it. */
const page = (scene, css) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}${RENDER_CSS}${CAP.css}</style></head><body><div class="fk ${scene.palette}">${scene.html()}</div></body></html>`;
/** Loads a scene, waits for its fonts and images, and installs the frame applier. */
async function load(tab, scene, css) {
  await tab.setContent(page(scene, css), { waitUntil: "load" });
  await tab.evaluate(async () => {
    await document.fonts.ready;
    const urls = new Set();
    for (const el of document.querySelectorAll("*")) {
      const bg = getComputedStyle(el).backgroundImage;
      for (const m of bg.matchAll(/url\("([^"]+)"\)/g)) urls.add(m[1]);
    }
    for (const img of document.images) urls.add(img.src);
    await Promise.all(
      [...urls].map((u) => {
        const i = new Image();
        i.src = u;
        return i.decode().catch(() => null);
      }),
    );
    const els = new Map();
    // `$src` changes an image (a frame of footage): the drawing waits until it is decoded, never a frame later.
    window.__apply = async (updates) => {
      const decoding = [];
      for (const [selector, index, props] of updates) {
        const key = `${selector}\u0000${index}`;
        let el = els.get(key);
        if (el === undefined) {
          el =
            index === null
              ? document.querySelector(selector)
              : document.querySelectorAll(selector)[index];
          if (!el)
            throw new Error(
              `Nothing on the page matches ${selector}${index === null ? "" : ` [${index}]`}`,
            );
          els.set(key, el);
        }
        for (const [k, v] of Object.entries(props)) {
          if (k === "$text") el.textContent = v;
          else if (k === "$src") {
            if (el.getAttribute("src") !== v) {
              el.setAttribute("src", v);
              decoding.push(el.decode());
            }
          } else el.style.setProperty(k, v);
        }
      }
      await Promise.all(decoding);
    };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
/** A scene's plate measurements: each named element's box in its plate's own CSS px. */
async function measure(tab, scene) {
  if (!scene.measure) return scene.derive ? scene.derive({}) : {};
  const raw = await tab.evaluate((queries) => {
    const out = {};
    for (const [name, [root, selector, all]] of Object.entries(queries)) {
      const plate = document.querySelector(root);
      const box = plate.getBoundingClientRect();
      const zoom = box.width / plate.offsetWidth;
      const rects = [...plate.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return [
          (r.left - box.left) / zoom,
          (r.top - box.top) / zoom,
          r.width / zoom,
          r.height / zoom,
        ];
      });
      if (!rects.length) throw new Error(`${root} has no ${selector}`);
      out[name] = all ? rects : rects[0];
    }
    return out;
  }, scene.measure);
  return scene.derive ? scene.derive(raw) : raw;
}

/** Draws frames [from, to) on WORKERS browsers, handing each PNG (2x) to `sink` in order. */
/**
 * A scene's still layers drawn once to images (scene.bake: [{ name, width, height, html }], CSS px), at the
 * drawing's 2x with transparency, into OUT/bake, and served to the scenes from BAKE_HOST. A layer the browser
 * would otherwise redraw on every drawing (a wall of screens under a 28 px blur, moving) is moved as a picture.
 */
const BAKE_HOST = "https://reel-bake.local";
const BAKED = path.join(OUT, "bake");
const routeBaked = (tab) =>
  tab.route(`${BAKE_HOST}/**`, (route) => {
    const file = path.join(BAKED, path.basename(new URL(route.request().url()).pathname));
    return fs.existsSync(file)
      ? route.fulfill({ path: file, contentType: "image/png" })
      : route.fulfill({ status: 404, body: "" });
  });
async function bake(browser, scenes, css) {
  fs.mkdirSync(BAKED, { recursive: true });
  for (const scene of scenes)
    for (const { name, width, height, html } of scene.bake ? scene.bake() : []) {
      const file = path.join(BAKED, name);
      if (fs.existsSync(file)) continue;
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: SUPERSAMPLE,
      });
      const tab = await ctx.newPage();
      await F.routeAssets(tab);
      await tab.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}${RENDER_CSS} html,body{background:transparent}</style></head><body>${html}</body></html>`,
        { waitUntil: "load" },
      );
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
      });
      // Kept once settled, as every drawing is (see `settle`).
      const { png, settled } = await settle(
        async () =>
          (
            await tab.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } })
          ).toString("base64"),
        () => twoFrames(tab),
      );
      if (!settled)
        throw new Error(`${name} was still changing after ${SETTLE_TRIES + 1} captures`);
      fs.writeFileSync(file, png);
      await ctx.close();
      console.log(`baked ${name}`);
    }
}

async function draw(frames, sink) {
  const { chromium } = F.playwright();
  const css = await F.stylesheet();
  // Measure each scene once.
  const probe = await chromium.launch(launchArgs());
  const measures = new Map();
  await bake(
    probe,
    SCENES.filter((scene) => frames.some((f) => f >= scene.from && f < scene.to)),
    css,
  );
  {
    const ctx = await probe.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
    const tab = await ctx.newPage();
    await F.routeAssets(tab);
    await routeBaked(tab);
    for (const scene of SCENES)
      if (frames.some((f) => f >= scene.from && f < scene.to)) {
        await load(tab, scene, css);
        measures.set(scene.id, {
          ...(await measure(tab, scene)),
          captions: await CAP.measure(tab),
        });
      }
  }
  await probe.close();
  const sceneAt = (f) => {
    const s = SCENES.find((x) => f >= x.from && f < x.to);
    if (!s) throw new Error(`No scene draws frame ${f}`);
    return s;
  };
  // Workers take frames in turn, so the frames finish roughly in order.
  const done = new Map();
  let next = 0;
  let wake = null;
  const deliver = async () => {
    while (next < frames.length && done.has(frames[next])) {
      const f = frames[next];
      const png = done.get(f);
      done.delete(f);
      next++;
      await sink(f, png);
    }
  };
  let captures = 0;
  const { retried, unsettled } = SETTLED;
  const worker = async (k) => {
    // A browser is relaunched every RECYCLE of its frames: one drawing the platform scene's 3D tilt grew to 3.9 GB
    // over about 120 of its frames and was killed for memory, which ended the run.
    const open = async () => {
      const browser = await chromium.launch(launchArgs());
      const ctx = await browser.newContext({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: SUPERSAMPLE,
      });
      const tab = await ctx.newPage();
      await F.routeAssets(tab);
      await routeBaked(tab);
      const cdp = await ctx.newCDPSession(tab);
      const capture = async () =>
        (
          await cdp.send("Page.captureScreenshot", {
            format: "png",
            optimizeForSpeed: true,
            clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SUPERSAMPLE },
          })
        ).data;
      return { browser, tab, capture };
    };
    let session = await open();
    let drawn = 0;
    let loaded = null;
    let last = new Map();
    for (let i = k; i < frames.length; i += WORKERS) {
      if (drawn > 0 && drawn % RECYCLE === 0) {
        await session.browser.close();
        session = await open();
        loaded = null;
      }
      drawn++;
      const { tab, capture } = session;
      const f = frames[i];
      const scene = sceneAt(f);
      if (loaded !== scene) {
        await load(tab, scene, css);
        loaded = scene;
        last = new Map();
      }
      // The frame's drawings over its open shutter; a drawing that changes nothing reuses the one before.
      const pngs = [];
      let previous = null;
      for (const t of subframeTimes(f)) {
        const updates = scene.state(t, measures.get(scene.id)).diff(last);
        if (previous && !updates.length) {
          pngs.push(previous);
          continue;
        }
        await tab.evaluate((u) => window.__apply(u), updates);
        const { png, retries, settled, seen } = await settle(capture, () => twoFrames(tab));
        if (retries) retried.set(f, (retried.get(f) ?? 0) + retries);
        if (!settled) {
          unsettled.add(f);
          keepUnsettled(f, seen);
          console.error(
            `frame ${f}: a drawing was still changing after ${SETTLE_TRIES + 1} captures`,
          );
        }
        previous = png;
        pngs.push(previous);
        captures++;
      }
      done.set(f, pngs);
      if (wake) wake();
      // Not too far ahead of the frame the encoder waits for (never the worker drawing that frame).
      while (i + WORKERS - next > WORKERS * 6) await new Promise((r) => setTimeout(r, 20));
    }
    await session.browser.close();
  };
  let finished = 0;
  const pump = (async () => {
    while (next < frames.length) {
      await deliver();
      if (next >= frames.length) break;
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 50);
      });
      if (finished === WORKERS && !done.has(frames[next]))
        throw new Error(`Frame ${frames[next]} was never drawn`);
    }
  })();
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, frames.length) }, (_, k) =>
      worker(k).then(() => {
        finished++;
      }),
    ),
  );
  await pump;
  return { measures: Object.fromEntries(measures), captures };
}

// ------------------------------------------------------------------ encoding
/**
 * The master: Lanczos down to 1080 x 1920 from the 2x drawing, BT.709 4:2:0 in the TV range by zimg with
 * error-diffusion dither (so the ground's gradients don't band), x264 High at CRF 12 with its dark-scene
 * adaptive quantisation, every colour tag written. The reference is the same picture before any of that
 * is lost: the 1080 x 1920 RGB frames, lossless.
 */
function encoder(film, reference, audio) {
  const scale = `zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos`;
  // Each frame's SUBFRAMES drawings come in a row: averaged, the last of each row kept, back to 30 fps.
  const shutter =
    SUBFRAMES > 1
      ? `,tmix=frames=${SUBFRAMES},select='eq(mod(n,${SUBFRAMES}),${SUBFRAMES - 1})',setpts=N/(${FPS}*TB)`
      : "";
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS * SUBFRAMES),
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    ...(audio ? ["-ss", String(audio.start), "-t", String(audio.seconds), "-i", audio.file] : []),
    "-filter_complex",
    `[0:v]format=gbrp,${scale}${shutter},split=2[m][r];` +
      `[m]zscale=rangein=full:primariesin=709:transferin=709:matrix=709:primaries=709:transfer=709:range=limited:dither=error_diffusion,format=yuv420p[master];` +
      `[r]format=gbrp[ref]`,
    "-map",
    "[master]",
    ...(audio ? ["-map", "1:a"] : []),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "12",
    "-profile:v",
    "high",
    "-level:v",
    "4.2",
    "-x264-params",
    "aq-mode=3:aq-strength=0.9",
    "-pix_fmt",
    "yuv420p",
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-r",
    String(FPS),
    "-g",
    String(FPS * 2),
    ...(audio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2"] : []),
    "-movflags",
    "+faststart",
    film,
    "-map",
    "[ref]",
    "-c:v",
    "ffv1",
    "-level",
    "3",
    "-g",
    "1",
    "-r",
    String(FPS),
    reference,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((resolve, reject) =>
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))),
  );
  return {
    write: (buf) =>
      new Promise((resolve, reject) =>
        ff.stdin.write(buf, (err) => (err ? reject(err) : resolve())),
      ),
    end: async () => {
      ff.stdin.end();
      await closed;
    },
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shots = BRIEF.shots;
  const i0 = shots.findIndex((s) => s.id === FIRST);
  const i1 = shots.findIndex((s) => s.id === LAST);
  if (i0 < 0 || i1 < i0)
    throw new Error(`Shots ${FIRST} to ${LAST} aren't a run of the brief's shots`);
  const from = frameOf(shots[i0].in);
  const to = frameOf(shots[i1].out);
  for (const s of shots.slice(i0, i1 + 1))
    if (!SCENES.some((x) => x.shots.includes(s.id)))
      throw new Error(`Shot ${s.id} has no scene to draw it yet`);
  const only = process.env.RENDER_FRAMES?.split(",").map(Number);
  const started = Date.now();
  if (only) {
    // A few frames to PNG at the frame's size, to look at.
    const { measures } = await draw(only, async (f, pngs) => {
      const file = path.join(OUT, `frame-${String(f).padStart(5, "0")}.png`);
      await new Promise((resolve, reject) => {
        const ff = spawn(
          "ffmpeg",
          [
            "-y",
            "-loglevel",
            "error",
            "-f",
            "image2pipe",
            "-c:v",
            "png",
            "-i",
            "pipe:0",
            "-vf",
            `format=gbrp,zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos${SUBFRAMES > 1 ? `,tmix=frames=${SUBFRAMES}` : ""},format=rgb24`,
            "-update",
            "1",
            file,
          ],
          { stdio: ["pipe", "inherit", "inherit"] },
        );
        ff.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
        );
        for (const png of pngs) ff.stdin.write(png);
        ff.stdin.end();
      });
    });
    console.log(
      `${only.length} frames → ${OUT} (${((Date.now() - started) / 1000).toFixed(1)} s)`,
      JSON.stringify(settleReport()),
      JSON.stringify(measures),
    );
    return;
  }
  const frames = Array.from({ length: to - from }, (_, i) => from + i);
  const film = path.join(OUT, "film.mp4");
  const reference = path.join(OUT, "reference.mkv");
  const audio = VOICEOVER
    ? { file: VOICEOVER, start: from / FPS, seconds: (to - from) / FPS }
    : null;
  const enc = encoder(film, reference, audio);
  let count = 0;
  const { measures, captures } = await draw(frames, async (f, pngs) => {
    for (const png of pngs) await enc.write(png);
    count++;
    if (count % 60 === 0)
      console.log(
        `${count}/${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s, ${SETTLED.retried.size} captured again to settle`,
      );
  });
  await enc.end();
  const log = frames.map((f) => {
    const t = f / FPS;
    const shot = shots.find((s) => frameOf(s.in) <= f && f < frameOf(s.out));
    // The caption words on screen (half in or more), as ./captions.cjs sets them word by word.
    return {
      frame: f,
      t: Number(t.toFixed(4)),
      shot: shot?.id ?? null,
      caption: CAP.visibleAt(t, { span: M.span, EASE: M.EASE }),
    };
  });
  fs.writeFileSync(
    path.join(OUT, "film.json"),
    `${JSON.stringify({ fps: FPS, from, to, supersample: SUPERSAMPLE, subframes: SUBFRAMES, shutter: SHUTTER, drawings: captures, settle: settleReport(), shots: shots.slice(i0, i1 + 1).map((s) => s.id), measures, frames: log }, null, 1)}\n`,
  );
  const settled = settleReport();
  console.log(
    `${frames.length} frames (${FIRST} to ${LAST}), ${captures} drawings → ${film} in ${((Date.now() - started) / 1000).toFixed(0)} s; ${settled.frames_retried} frames captured again to settle, ${settled.unsettled.length} never settled`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
