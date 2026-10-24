// Draws Reel 3's screens from the harness (the product's own components on Jordan Ellis' fictional record, the
// product's own functions answering them) to PNG at a high device scale, with a manifest of each picture's size and
// the regions the scenes point at.
//
//   node capture.cjs <outDir> [capture key ...]
//
// What is drawn is declared in ./captures/*.cjs: each capture opens a screen, works the page as a person would (presses
// a button by its words, types into a field, drops a file), and takes its pictures as it goes, each with its regions
// measured where the browser set them. The harness (vite, REEL_HARNESS_PORT, default 5198) and its backend
// (engine/server.ts, REEL_ENGINE_PORT, default 5299) must be running; the backend is put back to the record the fact
// find import writes before every capture, plus the extras the capture names (engine/extras/<name>.json), so a
// capture never depends on the one before.
//
// The page's clock is the demo's: Saturday 24 October 2026, 9:12 am in Sydney, so a "last calculated" reads as the
// product would say it a moment after the press.
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/node-tools/node_modules/playwright");

const OUT = path.resolve(process.argv[2] || "captures-out");
const ONLY = process.argv.slice(3);
const HARNESS = Number(process.env.REEL_HARNESS_PORT ?? 5198);
const ENGINE = Number(process.env.REEL_ENGINE_PORT ?? 5299);
const DEMO_TIME = "2026-10-24T09:12:30+11:00";

const CAPTURES = fs
  .readdirSync(path.join(__dirname, "captures"))
  .filter((f) => f.endsWith(".cjs"))
  .sort()
  .flatMap((f) => require(path.join(__dirname, "captures", f)));

/** Waits until the page has made no backend call for a while (window.__calls stops growing). */
async function settle(page, quiet = 1200) {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(quiet);
    const n = await page.evaluate(() => (window.__calls ?? []).length);
    if (n === last) break;
    last = n;
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  });
}

/** A locator from a region or step target: { selector, index } | { text, exact } | { role, name } | { label }. */
function locate(page, t) {
  let l;
  if (t.selector) l = page.locator(t.selector);
  else if (t.role) l = page.getByRole(t.role, { name: t.name, exact: t.exact ?? false });
  else if (t.label) l = page.getByLabel(t.label, { exact: t.exact ?? false });
  else if (t.text) l = page.getByText(t.text, { exact: t.exact ?? false });
  else throw new Error(`Nothing to locate in ${JSON.stringify(t)}`);
  return t.index === undefined ? l.first() : l.nth(t.index);
}

async function step(page, s) {
  if (s.click)
    await page
      .getByRole("button", { name: s.click, exact: s.exact ?? false })
      .first()
      .click();
  else if (s.tap) await locate(page, s.tap).click();
  else if (s.fill) await locate(page, s.fill).fill(String(s.value));
  else if (s.select) await locate(page, s.select).selectOption(s.value);
  else if (s.files) await locate(page, s.files).setInputFiles(path.resolve(s.path));
  else if (s.press) await page.keyboard.press(s.press);
  else if (s.evaluate) await page.evaluate(s.evaluate);
  else if (s.wait) await page.waitForTimeout(s.wait);
  else if (!s.settle) throw new Error(`An unknown step ${JSON.stringify(s)}`);
  await settle(page, s.quiet ?? 900);
}

async function shoot(page, cap, s, manifest) {
  const root = page.locator(s.of ?? `[data-shot="${cap.screen}"]`).first();
  await root.scrollIntoViewIfNeeded().catch(() => null);
  const box = await root.boundingBox();
  if (!box) throw new Error(`${s.shot}: nothing to draw`);
  const regions = {};
  for (const [name, t] of Object.entries(s.regions ?? {})) {
    const l = locate(page, t);
    const r = await l.boundingBox();
    if (!r) throw new Error(`${s.shot}: region ${name} (${JSON.stringify(t)}) is not on the page`);
    regions[name] = [r.x - box.x, r.y - box.y, r.width, r.height].map(
      (v) => Math.round(v * 100) / 100,
    );
  }
  const file = path.join(OUT, `${s.shot}.png`);
  await root.screenshot({
    path: file,
    omitBackground: Boolean(s.transparent),
    animations: "disabled",
  });
  manifest[s.shot] = {
    file: path.basename(file),
    css: [Math.round(box.width * 100) / 100, Math.round(box.height * 100) / 100],
    scale: cap.scale ?? 2,
    capture: cap.key,
    regions,
  };
  console.log(
    `${s.shot}: ${Math.round(box.width)} x ${Math.round(box.height)}, ${Object.keys(regions).length} regions`,
  );
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifestFile = path.join(OUT, "manifest.json");
  const manifest = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    : {};
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  for (const cap of CAPTURES) {
    if (ONLY.length && !ONLY.includes(cap.key)) continue;
    const reset = await fetch(`http://localhost:${ENGINE}/fn/__reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extras: cap.extras ?? [] }),
    });
    if (!reset.ok) throw new Error(`${cap.key}: the backend could not be reset (${reset.status})`);
    const ctx = await browser.newContext({
      viewport: {
        width: cap.viewport?.[0] ?? cap.width ?? 1440,
        height: cap.viewport?.[1] ?? 1000,
      },
      deviceScaleFactor: cap.scale ?? 2,
      timezoneId: "Australia/Sydney",
      locale: "en-AU",
    });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(cap.clock ?? DEMO_TIME) });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const query = new URLSearchParams({
      screen: cap.screen,
      engine: String(ENGINE),
      width: String(cap.width ?? 1440),
      ...(cap.query ?? {}),
    });
    await page.goto(`http://localhost:${HARNESS}/?${query}`, {
      waitUntil: "load",
      timeout: 300000,
    });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    await settle(page);
    for (const s of cap.steps ?? []) {
      if (s.shot) await shoot(page, cap, s, manifest);
      else await step(page, s);
    }
    if (errors.length) console.log(`${cap.key}: page errors:\n  ${errors.join("\n  ")}`);
    await ctx.close();
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
