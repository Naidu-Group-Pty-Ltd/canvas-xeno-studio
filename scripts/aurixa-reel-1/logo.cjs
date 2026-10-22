// The logo's moments for Reel 1 (system edition), made with a video model at the client's direction
// (22 October 2026): where the supplied logo stands in 04.1's reveal, and the frames the model starts and
// ends on, drawn by the renderer's own stylesheet so its footage and the film share one ground.
//   node scripts/aurixa-reel-1/logo.cjs <outDir> <assetsDir>   # hero-ground.png, hero-logo.png at 2160 x 3840
// The model never sees the lettering: it is given the logo's clean plate (logo-clean.png, the supplied
// art with AURIXA SYSTEMS taken out by an image edit and blended back only where the lettering was, see
// logo_motion.py), and the exact wordmark and emblem files are laid over its footage, where the art has them.
const fs = require("fs");
const path = require("path");

/** The supplied art (2000 x 1333) and the lockup in it: emblem.png and wordmark.png are exact crops of it. */
const ART = { w: 2000, h: 1333, emblem: [659, 211, 679, 628], wordmark: [561, 931, 882, 187] };

/**
 * 04.1's hero: the art at 0.8 CSS px a pixel (the emblem half the frame's width), centred across the frame (the art's centre is the emblem's),
 * the lockup (emblem top to wordmark foot) centred at y 830 in the frame's action zone (360 to 1300). The
 * art is wider than the frame, so its sides are cropped; above and below, it fades into the ground on a
 * smooth step (sky over `fadeTop`, floor over `fadeBottom`, CSS px).
 */
const HERO = (() => {
  const k = 0.8;
  const left = 540 - (ART.w / 2) * k;
  const lockup = [ART.emblem[1], ART.wordmark[1] + ART.wordmark[3]];
  const top = 830 - ((lockup[0] + lockup[1]) / 2) * k;
  const box = ([x, y, w, h]) => [left + x * k, top + y * k, w * k, h * k];
  return {
    k,
    art: [left, top, ART.w * k, ART.h * k],
    emblem: box(ART.emblem),
    wordmark: box(ART.wordmark),
    fadeTop: 170,
    fadeBottom: 160,
  };
})();

/** A mask that fades in over `a` px from the top and out over `b` px at the foot, on a smooth step. */
function fadeMask(a, b) {
  const steps = 8;
  const s = (u) => u * u * (3 - 2 * u);
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    stops.push(`rgba(0,0,0,${s(u).toFixed(4)}) ${(u * a).toFixed(2)}px`);
  }
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    stops.push(`rgba(0,0,0,${s(u).toFixed(4)}) calc(100% - ${(u * b).toFixed(2)}px)`);
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

/** The hero's art layer: the clean plate (or another file) where 04.1 puts the art, faded into the ground. */
const heroArtHtml = (src, id = "hero-art", z = 2) => {
  const [x, y, w, h] = HERO.art;
  const mask = fadeMask(HERO.fadeTop, HERO.fadeBottom);
  return `<div class="fk-layer" id="${id}" style="z-index:${z}"><img src="${src}" alt="" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;-webkit-mask-image:${mask};mask-image:${mask}"></div>`;
};

/** The ground the model is given: the site's deep navy and its glow, without the dot field (a video model
 * keeps a fine regular pattern poorly; the film draws its own dots over the footage). */
const modelGroundHtml = () => `<div class="fk-glow"></div>`;

module.exports = { ART, HERO, heroArtHtml, modelGroundHtml, fadeMask };

if (require.main === module) {
  (async () => {
    const F = require("./frames.cjs");
    const out = path.resolve(process.argv[2]);
    fs.mkdirSync(out, { recursive: true });
    const clean = F.asset ? F.asset("logo-clean.png") : null;
    const src = clean || "https://reel-assets.local/logo-clean.png";
    const css = await F.stylesheet();
    const { chromium } = F.playwright();
    const browser = await chromium.launch(F.CHROMIUM ? { executablePath: F.CHROMIUM } : {});
    const tab = await browser.newPage({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 2,
    });
    await F.routeAssets(tab);
    const shots = {
      "hero-ground.png": modelGroundHtml(),
      "hero-logo.png": modelGroundHtml() + heroArtHtml(src),
    };
    for (const [name, layers] of Object.entries(shots)) {
      await tab.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="fk aurixa">${layers}</div></body></html>`,
        { waitUntil: "load" },
      );
      await tab.evaluate(async () => {
        await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
      });
      await tab.screenshot({
        path: path.join(out, name),
        clip: { x: 0, y: 0, width: 1080, height: 1920 },
      });
      console.log(name);
    }
    fs.writeFileSync(path.join(out, "hero.json"), JSON.stringify(HERO, null, 1) + "\n");
    await browser.close();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
