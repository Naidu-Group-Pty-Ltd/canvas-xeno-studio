// A screen of the harness to PNG, to look at while building it: node look.cjs "<query>" <out.png> [width] [height]
// Prints the page's console errors and the backend calls it made. The harness (vite) and its backend must be running.
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const [query, out, w = "1440", h = "1000"] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: 1,
    timezoneId: "Australia/Sydney",
    locale: "en-AU",
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`console.${m.type()}:`, m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 600)));
  await page.goto(`http://localhost:${process.env.REEL_HARNESS_PORT ?? 5198}/?${query}`, {
    waitUntil: "load",
    timeout: 300000,
  });
  await page
    .waitForFunction(() => window.__ready === true, null, { timeout: 120000 })
    .catch(() => console.log("never ready"));
  // LOOK_CLICK="Calculate Capacity|View Full Calculator": press each button by its words, in turn, waiting for the
  // page to stop asking the backend after each.
  for (const words of (process.env.LOOK_CLICK ?? "").split("|").filter(Boolean)) {
    await page.getByRole("button", { name: words }).first().click();
    let last = -1;
    for (;;) {
      await page.waitForTimeout(1200);
      const n = await page.evaluate(() => window.__calls.length);
      if (n === last) break;
      last = n;
    }
  }
  console.log("calls:", JSON.stringify(await page.evaluate(() => window.__calls)));
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
