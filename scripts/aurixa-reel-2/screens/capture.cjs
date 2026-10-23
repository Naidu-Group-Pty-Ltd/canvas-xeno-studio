// Draws Reel 2's Passport pieces from the harness (the product's own components on Jordan Ellis's fictional case)
// to PNG at a high device scale, with a manifest of what each is and where the seals sit on their leaf.
//   node capture.cjs <outDir>
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const OUT = path.resolve(process.argv[2]);
const URL = "http://localhost:5199/";
fs.mkdirSync(OUT, { recursive: true });

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} never answered`);
}

(async () => {
  // A server already running for the harness is used as it is; otherwise one is started for the run.
  let vite = null;
  try {
    const r = await fetch(URL);
    if (!r.ok) throw new Error();
  } catch {
    vite = spawn("npx", ["vite", "--config", "vite.config.ts"], {
      cwd: __dirname,
      env: { ...process.env, NODE_PATH: path.join(__dirname, "node_modules") },
      stdio: ["ignore", "inherit", "inherit"],
    });
  }
  try {
    await waitFor(URL, 120000);
    const browser = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    });
    const manifest = { audiences: {}, stamps: {} };
    const shoot = async (query, scale, omitBackground, prefix, after) => {
      const ctx = await browser.newContext({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: scale,
        timezoneId: "Australia/Sydney",
        locale: "en-AU",
      });
      const page = await ctx.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") console.log("console:", m.text());
      });
      page.on("pageerror", (e) => console.log("pageerror:", e.message));
      await page.goto(URL + query, { waitUntil: "load", timeout: 300000 });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
      const shots = await page.$$eval("[data-shot]", (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { shot: e.dataset.shot, w: r.width, h: r.height };
        }),
      );
      for (const s of shots) {
        const el = await page.$(`[data-shot="${s.shot}"]`);
        await el.screenshot({ path: path.join(OUT, `${prefix}${s.shot}.png`), omitBackground });
      }
      const extra = after ? await after(page) : null;
      await ctx.close();
      return { shots, extra };
    };
    for (const audience of ["command", "partner"]) {
      const { shots, extra } = await shoot(
        `?screen=booklet&audience=${audience}&stage=${audience === "command" ? "issued" : "solicitor"}`,
        5,
        true,
        `${audience}-`,
        async (page) => {
          const pages = await page.evaluate(() => window.__pages);
          // The seals on their leaf: each earned impression's slot (the die and the portal under it) drawn alone on
          // a clear ground, at its place on the leaf, so a scene can strike them one at a time; and the leaf with the
          // earned slots left empty (the unearned keep their empty impressions, as the product draws them).
          const seals = await page.evaluate(() => {
            const leaf = document.querySelector('[data-shot="leaf-seals"]');
            if (!leaf) return null;
            const box = leaf.getBoundingClientRect();
            const slots = [...leaf.querySelectorAll(".passport-stamp-leaf__slot")];
            return {
              shot: leaf.dataset.shot,
              slots: slots.map((s, i) => {
                const r = s.getBoundingClientRect();
                const die = s.querySelector(".passport-stamp");
                const d = die.getBoundingClientRect();
                return {
                  n: i + 1,
                  pending: die.classList.contains("passport-stamp--pending"),
                  caption:
                    s.querySelector(".passport-stamp-leaf__cap")?.textContent?.trim() ?? null,
                  label: die.getAttribute("aria-label"),
                  box: [r.left - box.left, r.top - box.top, r.width, r.height],
                  die: [d.left - box.left, d.top - box.top, d.width, d.height],
                };
              }),
            };
          });
          if (seals) {
            const leafSel = `[data-shot="${seals.shot}"]`;
            const earned = seals.slots.filter((s) => !s.pending);
            const unstruck = await page.addStyleTag({
              content: earned
                .map(
                  (s) =>
                    `${leafSel} .passport-stamp-leaf__slot:nth-child(${s.n}) { visibility: hidden !important; }`,
                )
                .join("\n"),
            });
            await (
              await page.$(leafSel)
            ).screenshot({
              path: path.join(OUT, `${audience}-${seals.shot}-unstruck.png`),
              omitBackground: true,
            });
            await unstruck.evaluate((el) => el.remove());
            for (const s of earned) {
              const only = await page.addStyleTag({
                content: `${leafSel}, ${leafSel} * { visibility: hidden !important; }
                ${leafSel} .passport-stamp-leaf__slot:nth-child(${s.n}), ${leafSel} .passport-stamp-leaf__slot:nth-child(${s.n}) * { visibility: visible !important; }`,
              });
              await (
                await page.$(leafSel)
              ).screenshot({
                path: path.join(OUT, `${audience}-${seals.shot}-slot-${s.n}.png`),
                omitBackground: true,
              });
              await only.evaluate((el) => el.remove());
            }
          }
          const view = await page.evaluate(() => window.__view);
          return { pages, seals, view };
        },
      );
      manifest.audiences[audience] = { shots, ...extra };
      console.log(audience, shots.length, "pieces");
    }
    const { shots } = await shoot("?screen=stamps&audience=command&stage=all", 5, true, "stamp-");
    manifest.stamps = shots;
    console.log("stamps", shots.length);
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
    await browser.close();
  } finally {
    if (vite) vite.kill("SIGTERM");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
