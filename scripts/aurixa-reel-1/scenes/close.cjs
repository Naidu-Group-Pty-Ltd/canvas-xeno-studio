// Reel 1, shot 15.1: Aurixa Systems, and the trial. The closing card (PL-15A) is complete from its first frame
// over the wall, which keeps the drift it began in 14.1; the logo lives (the card take's footage, laid in by
// ../logo.cjs once it is made; until then the supplied art, as the plate draws it); and as the last line is
// spoken the site's own shimmer (.pricing-shimmer-text: white, focus cyan, white, at its own linear pace)
// crosses START YOUR FREE TRIAL once. Nothing builds on.
const M = require("../motion.cjs");
const { F, beat, shotOf, frameOf, span, r3, State, fade, captionHtml, caption, EASE } = M;
const L = require("../logo.cjs");
const { wallHtml, driftAt, WALL_BAKE } = require("./wall.cjs");

function closeScene() {
  const shot = shotOf("15.1");
  const tShimmer = beat("15.1", 1);
  // The plate's logo (plates.cjs logoArt at 1000 px) becomes the card logo that takes the footage, drawn the
  // same; START YOUR FREE TRIAL takes the site's shimmer.
  const card = F.plate("PL-15A", (html) => {
    const logo = /<img src="[^"]*logo-art\.png" alt="AURIXA SYSTEMS"[^>]*>/;
    if (!logo.test(html)) throw new Error("PL-15A has no logo image to lay the footage in");
    return html
      .replace(
        logo,
        L.cardLogoHtml({ id: "close-logo", width: 1000, style: "margin:-40px 0 -70px" }),
      )
      .replace(
        ">START YOUR FREE TRIAL<",
        '><span class="fk-shimmer" id="close-shimmer">START YOUR FREE TRIAL</span><',
      );
  });
  // wall(0.18) under the card: the wall's own veil is 0.3, so 0.257 more of the ground gives its 0.48.
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      wallHtml(),
      `<div class="fk-layer" style="z-index:2;background:var(--reel-ground);opacity:.257"></div>`,
      `<div class="fk-layer" style="z-index:3">${card.html}</div>`,
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#wall", { transform: `translateX(${r3(driftAt(t))}px)` });
    L.cardLogoState(st, "close-logo", t, { t0: shot.in, offset: 0, frameOf });
    // The site's band: 200% of the text wide, its cyan at the middle; from wholly left (150%) to wholly right
    // (-50%), linear as the site runs it, crossing once before the audio ends.
    const p = span(t, tShimmer, tShimmer + 1.3, EASE.linear);
    st.set("#close-shimmer", { "background-position": `${r3(150 - p * 200)}% 0` });
    return st;
  };
  return { id: "close", shots: ["15.1"], palette: "aurixa", html, state, bake: () => [WALL_BAKE] };
}

module.exports = closeScene;
