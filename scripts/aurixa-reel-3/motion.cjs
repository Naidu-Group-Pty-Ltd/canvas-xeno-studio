// Reel 3's motion toolkit: Reel 1's (../aurixa-reel-1/motion.cjs: the brand's own curves and durations, a frame's
// state, G-WINDOW moving, G-POINTER, G-FOCUS and the rail), on Reel 3's brief (brief.json) and captions
// (./captions.cjs). Reel 1's graphics kit, plates and frames (F, KIT) are shared as they are.
const fs = require("fs");
const path = require("path");
const R1 = require("../aurixa-reel-1/motion.cjs");
const CAP = require("./captions.cjs");

const BRIEF = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../docs/brands/aurixa-reel-3/brief.json"), "utf8"),
);
const shotOf = (id) => {
  const shot = BRIEF.shots.find((s) => s.id === id);
  if (!shot) throw new Error(`The brief has no shot ${id}`);
  return shot;
};
/** A beat's time: shot `id`'s beat `i`, as the brief times it. */
const beat = (id, i) => {
  const b = shotOf(id).beats[i];
  if (!b) throw new Error(`Shot ${id} has no beat ${i}`);
  return b.at;
};
const captionHtml = () => CAP.html();
/** The captions at t (./captions.cjs): the brand's type, each word on its spoken time. */
const caption = (st, t, m) =>
  CAP.state(st, t, m.captions, {
    span: R1.span,
    fade: R1.fade,
    EASE: R1.EASE,
    px: R1.px,
    r3: R1.r3,
  });

module.exports = { ...R1, BRIEF, shotOf, beat, CAP, captionHtml, caption };
