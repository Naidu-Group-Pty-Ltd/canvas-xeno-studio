// Reel 2, shots 04.1 to 04.3: the Compliance Passport, the product's own (PassportBook, drawn by the screens
// harness from Jordan Ellis's fictional case as it stands once issued). On the second drop it rises out of the dark
// turned away and turns to the camera; a light crosses its cover on "compliance" and it settles face-on on
// "passport". On "digital" its clasp catches the light and the camera moves in; on "organised" the cover opens to
// leaf I, Client Identity. Then the leaves turn on the words: Identity Verification, Screening, Funding & Due
// Diligence, and on "all" the rest riffle over to the Certification Seals, where the seals this case has earned
// are struck one after another, each where the product prints it.
//
// Leaf I's foot carries the product's banner, VERIFIED · TRUSTED · COMPLIANT. The reel says "compliant" nowhere,
// so from the moment the cover opens the camera holds the leaf with that banner below the light: the ground's own
// dark rises over the lower third of the frame (under the captions) and the banner sits in it, until the leaf has
// turned away.
const M = require("../motion.cjs");
const K2 = require("../kit2.cjs");

const { beat, shotOf, span, lerp, r3, px, State, fade, captionHtml, caption, EASE } = M;
const { screen, bookCss, bookHtml, bookState, LEAF } = K2;

/** The booklet's drawn scale: a leaf 470 x 648 in the product's px is 822 x 1134 in the frame at k = 1. */
const S = 1.75;
const LEAVES = [
  "identity",
  "verification",
  "screening",
  "funding",
  "evidence",
  "partners",
  "transaction",
];

const css = `
.ps-spot { position:absolute; left:0; top:0; width:1500px; height:1500px; border-radius:50%;
  background:radial-gradient(closest-side, rgba(94,221,232,.13), rgba(200,155,60,.07) 45%, rgba(4,11,22,0) 100%); }
.ps-band { position:absolute; left:0; right:0; top:1240px; bottom:0;
  background:linear-gradient(180deg, rgba(4,11,22,0) 0px, rgba(4,11,22,.86) 110px, rgba(4,11,22,.97) 170px, #040B16 260px); }
.ps-flash { position:absolute; inset:0; background:radial-gradient(60% 38% at 50% 40%, rgba(255,240,205,.55), rgba(94,221,232,.12) 55%, rgba(4,11,22,0) 100%); mix-blend-mode:screen; }
`;

function passportScene() {
  const s3 = shotOf("04.3");
  const [tRise, tSweep, tSettle] = [0, 1, 2].map((i) => beat("04.1", i));
  const [tClasp, tOpen] = [0, 1].map((i) => beat("04.2", i));
  const [tIdv, tScr, tDil, tAll] = [0, 1, 2, 3].map((i) => beat("04.3", i));

  const cover = screen("pp-cmd-cover").src;
  const seals = screen("pp-cmd-seals-unstruck");
  const leaves = LEAVES.map((k) => ({ key: k, src: screen(`pp-cmd-${k}`).src }));
  leaves.push({
    key: "seals",
    src: seals.src,
    seals: seals.seals.map((s) => ({
      src: `https://reel-assets.local/${s.file}`,
      at: [s.die[0] + s.die[2] / 2, s.die[1] + s.die[3] / 2],
    })),
  });
  const SEALS = leaves.length - 1;

  // When each leaf turns: I on "identity", III on "screening", IV on "diligence", then V to VIII riffle on "all".
  const TURN = 0.7;
  const RIFFLE = 0.34;
  const starts = [tIdv - 0.12, tScr - 0.12, tDil - 0.12];
  for (let i = 0; i < 4; i++) starts.push(tAll - 0.06 + i * 0.1);
  const lengths = [TURN, TURN, TURN, RIFFLE, RIFFLE, RIFFLE, RIFFLE];
  const turnedBy = starts.at(-1) + RIFFLE;
  // The seals, struck in the order the product lays them out, once the riffle has landed.
  const strikeAt = seals.seals.map((_, i) => turnedBy + 0.14 + i * 0.1);
  if (!(strikeAt.at(-1) + 0.25 < s3.out))
    throw new Error("04.3: the seals are still being struck at the cut");

  // The cover opens on "organised", the camera having moved in from "digital".
  const OPEN = 0.95;
  const html = () =>
    [
      `<style>${bookCss}${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="ps-spot" id="spot" style="z-index:1"></div>`,
      `<div class="fk-layer" style="z-index:2">${bookHtml("pp", { cover, leaves, scale: S })}</div>`,
      `<div class="ps-band" id="band" style="z-index:3"></div>`,
      `<div class="ps-flash" id="flash" style="z-index:4"></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The pose. Rise: from below, turned away and small, to near face-on; then face-on by "passport".
    const rise = span(t, tRise, tRise + 1.75, EASE.settle);
    const face = span(t, tRise + 1.2, tSettle, EASE.move);
    // In: from the clasp, the camera moves in on the record's top, so its foot will sit in the dark.
    const push = span(t, tClasp + 0.3, tOpen - 0.08, EASE.move);
    // Back out a little once leaf I has turned away (its banner never rises out of the dark).
    const back = span(t, tIdv + 0.32, tIdv + 1.4, EASE.move);
    const k = lerp(lerp(1, 1.32, push), 1.12, back);
    const H = LEAF[1] * S * k;
    // The banner's centre (0.808 of the leaf) at y 1430 once moved in; the leaf comes back up as it moves out.
    const yIn = 1430 - (0.808 - 0.5) * H;
    const y = lerp(lerp(lerp(1420, 760, rise), yIn, push), 900, back);
    const pose = {
      x: 540,
      y,
      z: lerp(-900, 0, rise),
      rx: lerp(lerp(58, 8, rise), 0, face),
      ry: lerp(lerp(-34, -14, rise), 0, face),
      rz: lerp(lerp(-12, -3, rise), 0, face),
      k: lerp(0.72, 1, rise) * k,
    };
    const turns = starts.map((a, i) => 180 * span(t, a, a + lengths[i], EASE.move));
    bookState(st, t, "pp", {
      scale: S,
      pose,
      opacity: span(t, tRise - 0.05, tRise + 0.35, EASE.linear),
      cover: 180 * span(t, tOpen, tOpen + OPEN, EASE.move),
      turns: [...turns, 0],
      sheen:
        t >= tSweep - 0.05 && t <= tSweep + 1.1
          ? span(t, tSweep - 0.05, tSweep + 1.0, EASE.move)
          : null,
      glint:
        t >= tClasp - 0.05 && t <= tClasp + 0.65
          ? span(t, tClasp - 0.05, tClasp + 0.6, EASE.linear)
          : null,
      strikes: [
        {
          leaf: SEALS,
          seals: seals.seals.map((s, i) => ({ at: strikeAt[i], die: s.die })),
        },
      ],
    });
    // The light behind it, following it up.
    st.set("#spot", {
      transform: `translate(${px(540 - 750)}, ${px(y - 750)})`,
      ...fade(0.35 + 0.65 * rise),
    });
    // The dark over the lower third: in as the camera moves in, out once leaf I has gone.
    st.set(
      "#band",
      fade(
        span(t, tClasp + 0.4, tOpen - 0.2, EASE.move) *
          (1 - span(t, tIdv + 0.5, tIdv + 1.3, EASE.move)),
      ),
    );
    // The drop's flash, as it rises.
    const f =
      t < tRise ? 0 : Math.exp(-(t - tRise) / 0.35) * span(t, tRise, tRise + 0.06, EASE.linear);
    st.set("#flash", fade(0.9 * f));
    return st;
  };

  return {
    id: "passport",
    shots: ["04.1", "04.2", "04.3"],
    palette: "aurixa",
    html,
    state,
  };
}

module.exports = passportScene;
