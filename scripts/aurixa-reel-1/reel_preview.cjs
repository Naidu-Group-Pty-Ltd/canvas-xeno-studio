// Draws Reel 1's graphics kit tokens as one sheet, using aurixa-reel.css alone (the stylesheet
// reel_css.ts writes from the brand's code): the swatches, and the kit's devices built from them.
// That covers the glass window, the record card in its focus corners, the rail with its
// traveller, and the pointer's press.
// Not a frame of the film: a check that every token renders as the code declares it.
// Run: node scripts/aurixa-reel-1/reel_preview.cjs [out.png]
const fs = require("fs");
const os = require("os");
const path = require("path");

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}

const DIR = path.resolve(__dirname, "../../docs/brands/aurixa-reel-1/system-edition");
const OUT = path.resolve(process.argv[2] || path.join(DIR, "aurixa-reel-tokens.png"));
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;

/** A Google font as a data URL, kept in the temp folder (Inter is a system font). */
async function googleFont(family, weight) {
  const file = path.join(os.tmpdir(), `${family.replace(/ /g, "-").toLowerCase()}-${weight}.ttf`);
  if (!fs.existsSync(file)) {
    const sheet = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`,
        { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } },
      )
    ).text();
    const url = /url\((https:[^)]+)\)/.exec(sheet)?.[1];
    if (!url) throw new Error(`${family} couldn't be found on Google Fonts`);
    fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  return dataUrl(file, "font/ttf");
}

// The site sets its mono labels in the browser's ui-monospace, drawn in Inconsolata as the plates do.
const FONTS = [
  ["Playfair Display", [500, 700]],
  ["Inconsolata", [400, 700]],
];

/** The swatches, by role: the brand's ground and gold first, today's tools last. */
const SWATCHES = [
  ["ground", "--reel-ground"],
  ["surface", "--reel-surface"],
  ["surface-raised", "--reel-surface-raised"],
  ["glass", "--reel-glass"],
  ["gold", "--reel-gold"],
  ["gold-ink", "--reel-gold-ink"],
  ["traveller", "--reel-traveller"],
  ["press-ring", "--reel-press-ring"],
  ["teal-builders", "--reel-teal-builders"],
  ["ink", "--reel-ink"],
  ["ink-muted", "--reel-ink-muted"],
  ["before-paper", "--reel-before-paper"],
  ["before-border", "--reel-before-border"],
  ["before-ink", "--reel-before-ink"],
  ["before-ink-muted", "--reel-before-ink-muted"],
];

async function main() {
  const tokens = fs.readFileSync(path.join(DIR, "aurixa-reel.css"), "utf8");
  const values = Object.fromEntries(
    [...tokens.matchAll(/^\s+(--reel-[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2]]),
  );
  const read = [...tokens.matchAll(/^ \*\s+(Naidu-Group-Pty-Ltd\/[\w-]+ @ \w+)/gm)].map((match) =>
    match[1].replace("Naidu-Group-Pty-Ltd/", ""),
  );
  const faces = [];
  for (const [family, weights] of FONTS)
    for (const weight of weights)
      faces.push(
        `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url("${await googleFont(family, weight)}") format("truetype"); }`,
      );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${faces.join("\n")}
${tokens.replace(/ui-monospace,monospace/g, '"Inconsolata",ui-monospace,monospace')}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1600px; height: 1000px; }
body { position: relative; overflow: hidden; background: var(--reel-ground); color: var(--reel-ink); font-family: var(--reel-sans); -webkit-font-smoothing: antialiased; }
.field { position: absolute; inset: 0; background-image: var(--reel-dot-field); background-size: var(--reel-dot-field-background-size); opacity: var(--reel-dot-field-opacity); }
.eyebrow { display: flex; align-items: center; gap: .75rem; font: var(--reel-mono); letter-spacing: var(--reel-mono-letter-spacing); text-transform: var(--reel-mono-text-transform); color: var(--reel-mono-color); font-size: 13px; }
.eyebrow > span { display: block; width: var(--reel-hairline-width); height: var(--reel-hairline-height); background: var(--reel-hairline); }
.head { position: absolute; left: 72px; top: 64px; }
.head h1 { margin-top: 18px; font-family: var(--reel-display); font-weight: 500; font-size: 52px; line-height: 1.08; letter-spacing: -.01em; }
.head p { margin-top: 14px; max-width: 640px; color: var(--reel-ink-muted); font-size: 17px; line-height: 1.6; }
.swatches { position: absolute; left: 72px; top: 330px; width: 700px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 16px; }
.swatch { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; }
.chip { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--reel-border); }
.swatch b { display: block; font: 700 11px/1.3 "Inconsolata", monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--reel-ink); }
.swatch i { display: block; margin-top: 3px; font: 400 11px/1.3 "Inconsolata", monospace; font-style: normal; color: var(--reel-ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stage { position: absolute; left: 860px; top: 120px; width: 660px; height: 640px; }
.aura { position: absolute; inset: -40px; background: radial-gradient(420px 260px at 30% 30%, color-mix(in srgb, var(--reel-teal-builders) 28%, transparent), transparent 70%), radial-gradient(380px 240px at 80% 75%, color-mix(in srgb, var(--reel-gold) 22%, transparent), transparent 70%); }
.window { position: absolute; left: 60px; top: 70px; width: 560px; height: 430px; border-radius: var(--reel-radius-window); background: var(--reel-glass); background-image: var(--reel-sheen); backdrop-filter: blur(var(--reel-glass-blur)); -webkit-backdrop-filter: blur(var(--reel-glass-blur)); border: 1px solid var(--reel-border); box-shadow: var(--reel-shadow-window); overflow: hidden; }
.bar { height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 18px; border-bottom: 1px solid var(--reel-border); }
.bar span { width: 10px; height: 10px; border-radius: 50%; background: var(--reel-ink-muted); opacity: .45; }
.card { position: absolute; left: 44px; top: 96px; width: 300px; padding: 22px 22px 20px; border-radius: var(--reel-radius-card); background: var(--reel-surface-raised); border: 1px solid var(--reel-border); }
.card h2 { margin-top: 12px; font-family: var(--reel-display); font-weight: 700; font-size: 30px; }
.card p { margin-top: 6px; color: var(--reel-ink-muted); font-size: 14px; }
.card .eyebrow { font-size: 10px; }
.corners { position: absolute; left: 30px; top: 82px; width: 328px; height: 196px; }
.corners::before, .corners::after { content: ""; position: absolute; width: var(--reel-corners-width); height: var(--reel-corners-height); }
.corners::before { top: 0; left: 0; border-top: var(--reel-corners); border-left: var(--reel-corners-border-left); }
.corners::after { right: 0; bottom: 0; border-right: var(--reel-corners-border-right); border-bottom: var(--reel-corners-border-bottom); }
.rail { position: absolute; left: 410px; top: 80px; bottom: 60px; width: var(--reel-link-line-width); background: var(--reel-link-line); }
.traveller { position: absolute; left: -2.5px; top: 46%; width: var(--reel-traveller-width); height: var(--reel-traveller-height); border-radius: var(--reel-traveller-border-radius); background: var(--reel-traveller); box-shadow: var(--reel-traveller-box-shadow); }
.pointer { position: absolute; left: 300px; top: 300px; }
.ring { position: absolute; left: -12px; top: -12px; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--reel-press-ring); }
.label { position: absolute; font: 400 11px/1.4 "Inconsolata", monospace; color: var(--reel-ink-muted); letter-spacing: .06em; }
.type { position: absolute; left: 72px; top: 610px; width: 700px; display: grid; gap: 22px; }
.type > div { display: grid; grid-template-columns: 150px 1fr; align-items: baseline; gap: 18px; border-top: 1px solid var(--reel-border); padding-top: 14px; }
.type b { font: 700 11px/1.3 "Inconsolata", monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--reel-ink-muted); }
.type .display { font-family: var(--reel-display); font-weight: 700; font-size: 34px; }
.type .sans { font-family: var(--reel-sans); font-size: 20px; }
.type .mono { font: var(--reel-mono); letter-spacing: var(--reel-mono-letter-spacing); text-transform: var(--reel-mono-text-transform); color: var(--reel-mono-color); font-size: 14px; }
.type .before { font-family: var(--reel-before-type); font-size: 18px; color: var(--reel-before-ink-muted); }
.foot { position: absolute; left: 72px; right: 72px; bottom: 44px; display: flex; justify-content: space-between; font: 400 12px/1.4 "Inconsolata", monospace; color: var(--reel-ink-muted); letter-spacing: .04em; }
</style></head><body>
<div class="field"></div>
<div class="head">
  <div class="eyebrow"><span></span>Aurixa Reel 1 · graphics kit · read from code</div>
  <h1>Every value is the code's own</h1>
  <p>${Object.keys(values).length} tokens, each with the repository, file and line it is declared on, written by Xeno Studio's code scanner. Every colour, typeface, line, glow, blur and shadow below is one of them.</p>
</div>
<div class="swatches">
${SWATCHES.map(
  ([role, name]) =>
    `<div class="swatch"><div class="chip" style="background: var(${name})"></div><div><b>${role}</b><i>${values[name] ?? "?"}</i></div></div>`,
).join("\n")}
</div>
<div class="type">
  <div><b>display</b><span class="display">One record, every portal</span></div>
  <div><b>sans</b><span class="sans">The professional's day, end to end.</span></div>
  <div><b>mono</b><span class="mono">Research · Financial · Report</span></div>
  <div><b>before-type</b><span class="before">Today's tools, in the system face</span></div>
</div>
<div class="stage">
  <div class="aura"></div>
  <div class="window">
    <div class="bar"><span></span><span></span><span></span></div>
    <div class="corners"></div>
    <div class="card">
      <div class="eyebrow"><span></span>Record</div>
      <h2>Residence 014</h2>
      <p>BK-014 · ready for the client</p>
    </div>
    <div class="rail"><div class="traveller"></div></div>
    <div class="pointer">
      <div class="ring"></div>
      <svg width="26" height="34" viewBox="0 0 26 34"><path d="M2 2 L2 27 L8.5 21 L13 31 L17.5 29 L13 19.5 L22 19.5 Z" fill="var(--reel-pointer)" stroke="var(--reel-pointer-edge)" stroke-width="1.6" stroke-linejoin="round"/></svg>
    </div>
  </div>
  <div class="label" style="left:60px; top:520px">glass · sheen · border · radius-window · shadow-window</div>
  <div class="label" style="left:60px; top:540px">record card · focus corners · link-line · traveller · pointer and press ring</div>
</div>
<div class="foot"><span>Written by scripts/aurixa-reel-1/reel_css.ts from ${read.join(" · ")}</span><span>aurixa-reel.css</span></div>
</body></html>`;
  const browser = await playwright().chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
