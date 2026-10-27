// We Are Here's drawn things, as pictures with their own transparency, for light.py to set in the frame: the panes of
// software that crowd the office (windows and dashboards, each tool its own accent), the strip of tabs and its one
// word, "AI", and the client's and the property's tags. They are As One's (scripts/aurixa-teaser/as-one/film.js),
// drawn the same way at twice As One's size, so they stay sharp as the camera comes close.
//   node scripts/aurixa-teaser/we-are-here/textures.cjs <work files dir>     # writes we-are-here/textures/*.png
const fs = require("fs");
const path = require("path");

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}

const PAGE = String.raw`
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const mix = (a, b, t) => a + (b - a) * t;
const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hash(i), hash(i + 1), u) * 2 - 1; };
const K = 2; // twice As One's size
function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w * K; c.height = h * K;
  const x = c.getContext("2d");
  x.scale(K, K);
  draw(x, w, h);
  return c.toDataURL("image/png");
}
function rr(x, X, Y, W, Hh, r) {
  x.beginPath(); x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + Hh, r); x.arcTo(X + W, Y + Hh, X, Y + Hh, r);
  x.arcTo(X, Y + Hh, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
}
const ACCENTS = ["#7aa7ff", "#9b8cff", "#5fd0c5", "#ff9f6e", "#c58cff", "#6ec7ff", "#ffcf6e", "#8ce0a0"];
function pane(kind, seed) {
  const rnd = (k) => hash(seed * 13.7 + k * 3.1);
  const acc = ACCENTS[Math.floor(rnd(1) * ACCENTS.length)];
  return canvas(640, 420, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    rr(x, 4, 4, w - 8, h - 8, 22);
    x.fillStyle = "rgba(14,24,42,0.80)"; x.fill();
    x.lineWidth = 3; x.strokeStyle = "rgba(190,215,255,0.55)"; x.stroke();
    x.fillStyle = "rgba(255,255,255,0.06)"; x.fillRect(8, 8, w - 16, 40);
    for (let i = 0; i < 3; i++) {
      x.beginPath(); x.arc(30 + i * 22, 28, 7, 0, Math.PI * 2);
      x.fillStyle = ["rgba(255,120,110,.7)", "rgba(255,200,90,.7)", "rgba(110,210,130,.7)"][i]; x.fill();
    }
    x.fillStyle = "rgba(200,220,255,0.30)"; rr(x, 110, 20, 120 + rnd(2) * 120, 14, 7); x.fill();
    x.fillStyle = acc; x.globalAlpha = 0.9; rr(x, w - 70, 19, 40, 16, 8); x.fill(); x.globalAlpha = 1;
    const bar = (X, Y, W, Hh, a = 0.28) => { x.fillStyle = "rgba(200,220,255," + a + ")"; rr(x, X, Y, W, Hh, Hh / 2); x.fill(); };
    if (kind === "window") {
      x.fillStyle = "rgba(255,255,255,0.045)"; x.fillRect(8, 48, 150, h - 56);
      for (let i = 0; i < 8; i++) bar(28, 76 + i * 38, 70 + rnd(10 + i) * 50, 12, i === 2 ? 0.55 : 0.25);
      x.fillStyle = acc; x.globalAlpha = 0.5; x.fillRect(12, 66 + 2 * 38, 4, 30); x.globalAlpha = 1;
      for (let i = 0; i < 7; i++) {
        const Y = 80 + i * 46;
        x.fillStyle = "rgba(255,255,255,0.05)"; rr(x, 184, Y - 10, w - 210, 36, 8); x.fill();
        x.beginPath(); x.arc(206, Y + 8, 9, 0, Math.PI * 2); x.fillStyle = "rgba(200,220,255,0.3)"; x.fill();
        bar(228, Y, 120 + rnd(20 + i) * 160, 10, 0.35);
        bar(228, Y + 14, 60 + rnd(30 + i) * 90, 7, 0.2);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        x.fillStyle = "rgba(255,255,255,0.05)"; rr(x, 24 + i * 202, 66, 186, 78, 12); x.fill();
        bar(42 + i * 202, 86, 60 + rnd(40 + i) * 50, 9, 0.28);
        bar(42 + i * 202, 108, 90 + rnd(50 + i) * 40, 18, 0.5);
      }
      x.fillStyle = "rgba(255,255,255,0.05)"; rr(x, 24, 160, 370, 236, 12); x.fill();
      for (let i = 0; i < 9; i++) {
        const hh = 30 + rnd(60 + i) * 150;
        x.fillStyle = i % 3 === 1 ? acc : "rgba(200,220,255,0.38)";
        x.globalAlpha = i % 3 === 1 ? 0.8 : 1;
        rr(x, 46 + i * 38, 380 - hh, 22, hh, 5); x.fill(); x.globalAlpha = 1;
      }
      x.fillStyle = "rgba(255,255,255,0.05)"; rr(x, 410, 160, 206, 236, 12); x.fill();
      x.beginPath(); x.arc(513, 262, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.35 + rnd(70) * 0.5));
      x.lineWidth = 16; x.strokeStyle = acc; x.stroke();
      x.beginPath(); x.arc(513, 262, 62, 0, Math.PI * 2); x.lineWidth = 16; x.strokeStyle = "rgba(200,220,255,0.12)"; x.stroke();
      bar(450, 356, 126, 10, 0.3);
      x.beginPath();
      for (let i = 0; i <= 12; i++) {
        const X = 46 + i * 28, Y = 230 + noise1(seed * 5 + i * 0.7) * 40 - i * 4;
        i ? x.lineTo(X, Y) : x.moveTo(X, Y);
      }
      x.lineWidth = 3; x.strokeStyle = "rgba(240,248,255,0.55)"; x.stroke();
    }
  });
}
function tab(label) {
  return canvas(512, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    rr(x, 6, 10, w - 12, h - 10, 18);
    x.fillStyle = label ? "rgba(40,70,120,0.95)" : "rgba(22,36,60,0.92)"; x.fill();
    x.lineWidth = 3; x.strokeStyle = label ? "rgba(200,225,255,0.95)" : "rgba(170,200,240,0.45)"; x.stroke();
    x.beginPath(); x.arc(46, 53, 15, 0, Math.PI * 2);
    x.fillStyle = label ? "rgba(225,240,255,0.95)" : "rgba(170,200,240,0.4)"; x.fill();
    if (label) {
      x.font = '700 46px "MONO"'; x.fillStyle = "rgba(240,248,255,1)"; x.textBaseline = "middle"; x.fillText(label, 82, 55);
      x.font = '400 40px "MONO4"'; x.fillStyle = "rgba(200,220,255,0.6)"; x.fillText("×", w - 60, 52);
    } else {
      x.fillStyle = "rgba(170,200,240,0.35)"; rr(x, 80, 45, 200, 16, 8); x.fill();
    }
  });
}
function tag(text) {
  return canvas(640, 120, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    rr(x, 6, 10, w - 12, h - 20, 24);
    x.fillStyle = "rgba(8,16,30,0.86)"; x.fill();
    x.lineWidth = 3; x.strokeStyle = "rgba(245,209,122,0.95)"; x.stroke();
    x.beginPath(); x.arc(50, h / 2, 10, 0, Math.PI * 2); x.fillStyle = "#F5D17A"; x.fill();
    x.font = '700 44px "MONO"'; x.letterSpacing = "8px"; x.textBaseline = "middle"; x.fillStyle = "#FBE7B5";
    x.fillText(text, 80, h / 2 + 2);
  });
}
window.drawAll = async () => {
  await document.fonts.load('700 46px "MONO"');
  await document.fonts.load('400 40px "MONO4"');
  const out = {};
  for (let i = 0; i < 6; i++) out["pane-window-" + i] = pane("window", 11 + i * 7);
  for (let i = 0; i < 6; i++) out["pane-dash-" + i] = pane("dash", 5 + i * 9);
  out["tab"] = tab(null);
  out["tab-ai"] = tab("AI");
  out["tag-client"] = tag("JORDAN ELLIS");
  out["tag-property"] = tag("14 WATTLE GROVE");
  return out;
};
`;

(async () => {
  const work = path.resolve(process.argv[2]);
  const out = path.join(work, "we-are-here", "textures");
  fs.mkdirSync(out, { recursive: true });
  const fonts = path.join(work, "fonts");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family:"MONO"; src:url('file://${fonts}/inconsolata-700.ttf'); font-weight:700; }
@font-face { font-family:"MONO4"; src:url('file://${fonts}/inconsolata-400.ttf'); font-weight:400; }
</style></head><body><script>${PAGE}</script></body></html>`;
  const page = path.join(out, "textures.html");
  fs.writeFileSync(page, html);
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
  const tab = await (await browser.newContext()).newPage();
  const errors = [];
  tab.on("pageerror", (e) => errors.push(String(e)));
  await tab.goto("file://" + page, { waitUntil: "load" });
  const pics = await tab.evaluate(() => window.drawAll());
  if (errors.length) throw new Error(errors.join(" | "));
  for (const [name, url] of Object.entries(pics)) {
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
  }
  fs.rmSync(page);
  await browser.close();
  console.log(`${Object.keys(pics).length} textures → ${out}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
