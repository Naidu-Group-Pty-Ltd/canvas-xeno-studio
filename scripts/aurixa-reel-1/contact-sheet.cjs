// A contact sheet of the rendered plates, for review.
const fs = require("fs"),
  path = require("path");
const { chromium } = (() => {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
})();
const dir = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .sort();
const tile = (f) =>
  `<figure><div class="img" style="background-image:url(data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString("base64")})"></div><figcaption>${f.replace(".png", "")}</figcaption></figure>`;
const html = `<!doctype html><style>body{margin:0;background:#2b3442;font-family:Inter;color:#e5e7eb;padding:24px}main{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}
figure{margin:0}.img{aspect-ratio:16/10;background:#5b6575 center/contain no-repeat;border-radius:6px;background-color:#4b5563}figcaption{font-size:15px;margin-top:6px}</style><main>${files.map(tile).join("")}</main>`;
(async () => {
  const local = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const b = await chromium.launch(fs.existsSync(local) ? { executablePath: local } : {});
  const p = await b.newPage();
  await p.setViewportSize({ width: 2400, height: 1000 });
  await p.setContent(html);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
