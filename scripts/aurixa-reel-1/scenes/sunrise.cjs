// Reel 1, shot 10.1 (third cut): not on the horizon. Dawn over the brand's night: a long gold horizon across the
// lower third, the sun's edge clearing it as the shot opens, then the whole disc up and climbing while "Aurixa
// Systems isn't on the horizon" is said; its rays fan out and the navy warms toward gold, and on the music's
// bar 32 (the groove's new section) the rays burst once. The floor below is the site's grid-forward, coming
// toward the viewer, with the sun's road on it. The camera rises with the sun. The sun comes to rest where
// 10.2's logo leaps out of it (../pages/light.cjs carries the same dawn into 10.2, so the cut moves nothing).
const M = require("../motion.cjs");
const L = require("../pages/light.cjs");
const PACE = require("../pacing.cjs");

const { beat, shotOf, span, State, captionHtml, caption, EASE } = M;

/** The film's bar b (0 is the drop), its attack. */
const bar = (b) => PACE.MUSIC.film_drop + 4 * b * PACE.MUSIC.period;

function sunriseScene() {
  const shot = shotOf("10.1");
  const t0 = beat("10.1", 0);
  // The groove's new section, under "isn't on the horizon": the rays burst on its downbeat.
  const tBurst = bar(32);
  if (!(tBurst > shot.in && tBurst < shot.out)) throw new Error("10.1: bar 32 isn't in the shot");

  const html = () => [`<style>${L.dawnCss}</style>`, L.dawnHtml("dw"), captionHtml()].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The burst: up on the bar, easing away over a bar.
    const burst =
      t < tBurst ? 0 : Math.exp(-(t - tBurst) / 0.55) * span(t, tBurst, tBurst + 0.08, EASE.linear);
    L.dawnState(st, t, "dw", { t0, burst });
    return st;
  };

  return { id: "sunrise", shots: ["10.1"], palette: "aurixa", html, state };
}

module.exports = sunriseScene;
