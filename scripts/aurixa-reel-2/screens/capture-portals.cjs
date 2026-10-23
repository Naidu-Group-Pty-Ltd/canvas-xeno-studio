// Draws Reel 2's portal screens from the harness (./src/screens.tsx) to PNG at a high device scale, with each
// screen's named regions measured (data-nav, data-region, data-doc, data-tick, data-confirm, data-demo, and every
// roster row's send button), so the scenes can point at them.
//   node capture-portals.cjs <outDir>
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

const JOBS = [
  {
    query: "?screen=solicitor&state=dashboard&theme=dark&width=1440",
    viewport: [1440, 960],
    scale: 3,
    transparent: false,
  },
  {
    query: "?screen=solicitor&state=compliance&theme=dark&width=1440",
    viewport: [1440, 960],
    scale: 3,
    transparent: false,
  },
  {
    query: "?screen=solicitor&state=matter&theme=dark&width=1440",
    viewport: [1440, 960],
    scale: 3,
    transparent: false,
  },
  {
    query: "?screen=roster&theme=dark&width=760",
    viewport: [1280, 800],
    scale: 4,
    transparent: true,
  },
  {
    query: "?screen=roster&sent=org-shah&theme=dark&width=760",
    viewport: [1280, 800],
    scale: 4,
    transparent: true,
  },
  {
    query: "?screen=consent&theme=dark&width=720",
    viewport: [1280, 900],
    scale: 4,
    transparent: true,
  },
  {
    query: "?screen=consent&sharing=1&theme=dark&width=720",
    viewport: [1280, 900],
    scale: 4,
    transparent: true,
  },
];

(async () => {
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
    const manifest = {};
    for (const job of process.env.ONLY
      ? JOBS.filter((j) => j.query.includes(process.env.ONLY))
      : JOBS) {
      const ctx = await browser.newContext({
        viewport: { width: job.viewport[0], height: job.viewport[1] },
        deviceScaleFactor: job.scale,
        timezoneId: "Australia/Sydney",
        locale: "en-AU",
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("pageerror:", e.message));
      page.on("console", (m) => {
        if (m.type() === "error") console.log("console:", m.text().slice(0, 300));
      });
      await page.goto(URL + job.query, { waitUntil: "load", timeout: 300000 });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const shot = document.querySelector("[data-shot]");
        const box = shot.getBoundingClientRect();
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return [r.left - box.left, r.top - box.top, r.width, r.height].map(
            (v) => Math.round(v * 10) / 10,
          );
        };
        const named = {};
        for (const attr of [
          "data-nav",
          "data-region",
          "data-doc",
          "data-tick",
          "data-confirm",
          "data-demo",
        ])
          for (const el of shot.querySelectorAll(`[${attr}]`))
            named[`${attr.slice(5)}:${el.getAttribute(attr) || "-"}`] = rect(el);
        // Roster rows and their buttons, by partner.
        for (const li of shot.querySelectorAll(
          "section[aria-label='Partners on this matter'] li",
        )) {
          const name = li.querySelector(".truncate.text-sm")?.textContent?.trim();
          if (!name) continue;
          named[`row:${name}`] = rect(li);
          const btn = [...li.querySelectorAll("button")].find((b) =>
            /Send the Passport|Nothing owed/.test(b.textContent),
          );
          if (btn) named[`send:${name}`] = rect(btn);
        }
        // The matter list's rows.
        for (const b of shot.querySelectorAll(
          "nav[aria-label='Matters shared with your organisation'] li button",
        ))
          named[`matter:${b.querySelector(".text-sm")?.textContent?.trim()}`] = rect(b);
        // The opened Passport's board, where it is drawn.
        const board = shot.querySelector(".passport-scope");
        if (board) named["passport:board"] = rect(board);
        return { shot: shot.dataset.shot, size: [box.width, box.height], named };
      });
      const el = await page.$("[data-shot]");
      await el.screenshot({
        path: path.join(OUT, `${info.shot}.png`),
        omitBackground: job.transparent,
      });
      manifest[info.shot] = { ...info, scale: job.scale, query: job.query };
      console.log(
        info.shot,
        info.size.map(Math.round).join("x"),
        Object.keys(info.named).length,
        "regions",
      );
      await ctx.close();
    }
    const file = path.join(OUT, "manifest.json");
    const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    fs.writeFileSync(file, JSON.stringify({ ...before, ...manifest }, null, 1));
    await browser.close();
  } finally {
    if (vite) vite.kill("SIGTERM");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
