// Photographs We Are Here's words (type.py's page) frame by frame, with nothing behind them, for comp.py.
//   node scripts/aurixa-teaser/we-are-here/type.cjs <work files dir>                 # all 1,092 frames
//   TYPE_FRAMES=0,300,600 node ... <work files dir>                                   # those frames only
// Each frame is a PNG with its own transparency (we-are-here/type/frames/<n>.png), kept once two captures of it in a
// row agree (Chromium can hand back a capture before every tile is painted). TYPE_WORKERS processes (default 2) share
// the frames; each restarts its browser every TYPE_RECYCLE frames.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FPS = 24;
const FRAMES = Math.round(45.5 * FPS);
const WIDTH = 1080;
const HEIGHT = 1920;
const WORKERS = Number(process.env.TYPE_WORKERS || 2);
const RECYCLE = Number(process.env.TYPE_RECYCLE || 200);

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}

async function open(page) {
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const tab = await ctx.newPage();
  const errors = [];
  tab.on("pageerror", (e) => errors.push(String(e)));
  tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await tab.goto("file://" + page, { waitUntil: "load" });
  await tab.evaluate(() => window.setT(0));
  if (errors.length) throw new Error(`the page reported: ${errors.join(" | ")}`);
  const cdp = await ctx.newCDPSession(tab);
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const capture = async () =>
    (await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } })).data;
  return { browser, tab, capture, errors };
}

async function draw(page, frames, out, label) {
  let film = await open(page);
  let drawn = 0;
  const started = Date.now();
  for (const f of frames) {
    if (drawn && drawn % RECYCLE === 0) {
      await film.browser.close();
      film = await open(page);
    }
    await film.tab.evaluate((t) => window.setT(t), f / FPS);
    let a = await film.capture();
    for (let i = 0; i < 6; i++) {
      const b = await film.capture();
      if (a === b) break;
      a = b;
      if (i === 5) console.error(`frame ${f}: still changing after 7 captures`);
    }
    if (film.errors.length) throw new Error(`frame ${f}: the page reported ${film.errors.join(" | ")}`);
    fs.writeFileSync(path.join(out, `${String(f).padStart(5, "0")}.png`), Buffer.from(a, "base64"));
    drawn++;
    if (drawn % 100 === 0) console.log(`${label}${drawn}/${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  await film.browser.close();
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === "--part") {
    const [, k, first, last, page, out] = argv;
    const frames = [];
    for (let f = Number(first); f < Number(last); f++) frames.push(f);
    await draw(page, frames, out, `part ${k}: `);
    return;
  }
  const root = path.resolve(argv[0], "we-are-here", "type");
  const page = path.join(root, "type.html");
  const out = path.join(root, "frames");
  fs.mkdirSync(out, { recursive: true });
  const only = process.env.TYPE_FRAMES?.split(",").filter(Boolean).map(Number);
  if (only) {
    await draw(page, only, out, "");
    return;
  }
  const bounds = Array.from({ length: WORKERS + 1 }, (_, k) => Math.round((FRAMES * k) / WORKERS));
  const started = Date.now();
  await Promise.all(bounds.slice(0, -1).map((first, k) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--part", String(k), String(first), String(bounds[k + 1]), page, out], { stdio: "inherit" });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`part ${k} exited ${code}`))));
  })));
  console.log(`${FRAMES} frames → ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
