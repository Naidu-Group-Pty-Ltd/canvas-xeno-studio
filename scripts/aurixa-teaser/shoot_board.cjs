// Photographs the storyboard page (frames/board.html) whole, at 2500 px wide.
//   node shoot_board.cjs <frames dir> <out.png>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const dir = path.resolve(process.argv[2]);
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const tab = await browser.newPage({
    viewport: { width: 2500, height: 1400 },
    deviceScaleFactor: 1,
  });
  await tab.goto("file://" + path.join(dir, "board.html"));
  await tab.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((i) =>
        i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)),
      ),
    );
  });
  await tab.screenshot({ path: path.resolve(process.argv[3]), fullPage: true });
  await browser.close();
})();
