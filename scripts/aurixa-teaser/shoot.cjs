// Photographs each style-frame page (frames/sf*.html) at 1080 x 1920 once its fonts and images have settled.
//   node shoot.cjs <frames dir> [name ...]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const dir = path.resolve(process.argv[2]);
  const want = process.argv.slice(3);
  const pages = fs
    .readdirSync(dir)
    .filter((f) => /^sf\d+b?\.html$/.test(f))
    .filter((f) => !want.length || want.includes(f.replace(".html", "")))
    .sort();
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  for (const f of pages) {
    const tab = await ctx.newPage();
    await tab.goto("file://" + path.join(dir, f));
    await tab.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) =>
          i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)),
        ),
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const broken = await tab.evaluate(() =>
      [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src),
    );
    if (broken.length) console.error(f, "missing images:", broken);
    const out = path.join(dir, f.replace(".html", ".png"));
    await tab.screenshot({ path: out });
    console.log("shot", out);
    await tab.close();
  }
  await browser.close();
})();
