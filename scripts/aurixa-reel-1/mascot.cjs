// Renders the Aurixa Agent's presence (the mascot on the floating button and in the agent's header)
// to a transparent PNG, from the portals' own sources: its markup (AurixaPresence, AurixaDelta), its
// stylesheet (aurixa.css), the dark theme's --aurixa-* tokens, the A's traced outline
// (deltaGeometry.pure.ts) and the A's texture. At rest and still, as a still frame shows her.
// Run: node scripts/aurixa-reel-1/mascot.cjs <npc-client-dashboard checkout> <out.png> [size px]
const fs = require("fs");
const path = require("path");

const req = (name) => {
  try {
    return require(name);
  } catch {
    return require(`/opt/node-tools/node_modules/${name}`);
  }
};
const ts = req("typescript");
const { chromium } = req("playwright");

const [repo, out, sizeArg] = process.argv.slice(2);
const SIZE = Number(sizeArg || 256);
const AGENT = path.join(repo, "src/components/agent");

// The geometry is a pure module: transpile it and read its exports.
const geometry = {};
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync(path.join(AGENT, "presence/deltaGeometry.pure.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
)(geometry);
const { DELTA_VIEWBOX, DELTA_FRAME, DELTA_OUTLINE, DELTA_BLOOMS, DELTA_GLINTS, DELTA_SWEEP } =
  geometry;
for (const [k, v] of Object.entries({
  DELTA_VIEWBOX,
  DELTA_FRAME,
  DELTA_OUTLINE,
  DELTA_BLOOMS,
  DELTA_GLINTS,
  DELTA_SWEEP,
}))
  if (v === undefined) throw new Error(`deltaGeometry.pure.ts no longer exports ${k}`);

// The dark theme's agent tokens, from the block that declares them.
const tokens = fs.readFileSync(path.join(repo, "src/styles/tokens.css"), "utf8");
const dark = tokens.slice(tokens.indexOf("Aurixa Agent — signature UI tokens (dark)"));
const vars = [
  ...dark.slice(0, dark.indexOf("}")).matchAll(/(--(?:aurixa|on-obsidian)[a-z0-9-]*):\s*([^;]+);/g),
]
  .map(([, k, v]) => `${k}: ${v};`)
  .join(" ");

const texture = `data:image/webp;base64,${fs.readFileSync(path.join(AGENT, "presence/art/aurixa-a-1080.webp")).toString("base64")}`;
const id = "aurixa-delta-m";
const delta = `<svg class="aurixa-presence__delta" viewBox="${DELTA_VIEWBOX}" aria-hidden="true">
  <defs><clipPath id="${id}-a"><path d="${DELTA_OUTLINE}"/></clipPath>
    <linearGradient id="${id}-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="aurixa-delta__stop aurixa-delta__stop--sweep-0"/>
      <stop offset="0.5" class="aurixa-delta__stop aurixa-delta__stop--sweep-1"/><stop offset="1" class="aurixa-delta__stop aurixa-delta__stop--sweep-2"/></linearGradient>
    <radialGradient id="${id}-bloom"><stop offset="0" class="aurixa-delta__stop aurixa-delta__stop--bloom-0"/>
      <stop offset="0.45" class="aurixa-delta__stop aurixa-delta__stop--bloom-1"/><stop offset="1" class="aurixa-delta__stop aurixa-delta__stop--bloom-2"/></radialGradient></defs>
  ${DELTA_BLOOMS.map((b, i) => `<circle class="aurixa-delta__bloom${i === 0 ? " aurixa-delta__bloom--apex" : ""}" cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="url(#${id}-bloom)"/>`).join("")}
  <g class="aurixa-delta__metal" clip-path="url(#${id}-a)">
    <image class="aurixa-delta__texture" href="${texture}" x="${DELTA_FRAME.x}" y="${DELTA_FRAME.y}" width="${DELTA_FRAME.width}" height="${DELTA_FRAME.height}" preserveAspectRatio="none"/>
    <path class="aurixa-delta__sweep" d="${DELTA_SWEEP}" fill="url(#${id}-sweep)"/></g>
  <path class="aurixa-delta__glint aurixa-delta__glint--apex" d="${DELTA_GLINTS.apex}"/>
  <path class="aurixa-delta__glint aurixa-delta__glint--left" d="${DELTA_GLINTS.left}"/>
  <path class="aurixa-delta__glint aurixa-delta__glint--right" d="${DELTA_GLINTS.right}"/></svg>`;
const orbit = (
  front,
) => `<svg class="aurixa-presence__orbit${front ? " aurixa-presence__orbit--front" : ""}" viewBox="-360 -360 720 720" aria-hidden="true">
  <g transform="rotate(-12)"><ellipse class="aurixa-presence__orbit-path" rx="320" ry="93"/><ellipse class="aurixa-presence__orbit-satellite" rx="320" ry="93"/></g></svg>`;
const presence = `<span class="aurixa-presence aurixa-presence--still" data-mood="idle" data-scale="grand" style="--ap-size:${SIZE}px">
  <span class="aurixa-presence__halo"></span>${delta}<span class="aurixa-presence__pedestal"></span>${orbit(false)}
  <span class="aurixa-presence__ring"></span>
  <span class="aurixa-presence__body"><span class="aurixa-presence__swirl"></span><span class="aurixa-presence__sheen"></span>
    <span class="aurixa-presence__face"><span class="aurixa-presence__brow"></span><span class="aurixa-presence__brow aurixa-presence__brow--right"></span>
      <span class="aurixa-presence__eye"></span><span class="aurixa-presence__eye"></span><span class="aurixa-presence__cheek"></span>
      <span class="aurixa-presence__cheek aurixa-presence__cheek--right"></span><span class="aurixa-presence__mouth"></span></span></span>
  ${orbit(true)}<span class="aurixa-presence__waves"></span></span>`;

(async () => {
  const browser = await chromium.launch(
    fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
      ? { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }
      : {},
  );
  const page = await browser.newPage({
    viewport: { width: SIZE * 5, height: SIZE * 5 },
    reducedMotion: "reduce",
  });
  await page.setContent(`<!doctype html><html class="dark"><head><style>:root, .dark { ${vars} }
    html, body { margin:0; background:transparent; } .stage { position:absolute; inset:0; display:grid; place-items:center; }
    *, *::before, *::after { animation-play-state: paused !important; animation-delay: -1s !important; transition: none !important; }
    ${fs.readFileSync(path.join(AGENT, "aurixa.css"), "utf8")}</style></head><body><div class="stage">${presence}</div></body></html>`);
  await page.waitForTimeout(300);
  // A square about her: the A, the moon and the pedestal, with room for the glow.
  const box = await page.evaluate(() => {
    const b = document.querySelector(".aurixa-presence__delta").getBoundingClientRect();
    const side = Math.max(b.width, b.height) * 1.08;
    return { x: b.left + b.width / 2 - side / 2, y: b.top + b.height / 2 - side / 2, width: side, height: side };
  });
  await page.screenshot({ path: out, omitBackground: true, clip: box });
  await browser.close();
  console.log(out, Math.round(box.width), "x", Math.round(box.height));
})();
