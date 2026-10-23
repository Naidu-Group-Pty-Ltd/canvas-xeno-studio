// Reel 2 on the film's clock: the pauses pacing.py holds the voiceover open with (pacing.json), so a time measured
// on the voiceover (a caption, a word) lands where the film puts it. A word moves with every pause at or before it;
// a cut or a beat with every pause before it (one placed exactly on a cut opens what it starts). Until the music is
// chosen and the film paced to it there are no pauses, and the film's clock is the voice's.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../../docs/brands/aurixa-reel-2/pacing.json");
const BRIEF = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../docs/brands/aurixa-reel-2/brief.json"), "utf8"),
);
const PACING = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE, "utf8"))
  : { fps: 30, pauses: [], end: BRIEF.end, music: null };
const shift = (t, at) =>
  PACING.pauses.reduce(
    (s, p) => s + ((at ? p.at <= t + 1e-6 : p.at < t - 1e-6) ? p.frames / PACING.fps : 0),
    0,
  );
/** A word's (or a caption's) time on the voiceover, on the film's clock. */
const word = (t) => Number((t + shift(t, true)).toFixed(6));
/** A cut's or a beat's time on the voiceover, on the film's clock. */
const cut = (t) => Number((t + shift(t, false)).toFixed(6));

module.exports = { PACING, word, cut, END: PACING.end, MUSIC: PACING.music };
