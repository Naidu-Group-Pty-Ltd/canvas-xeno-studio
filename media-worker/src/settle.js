import { inflateSync } from "node:zlib";

/**
 * A drawing kept only once it has settled, and a stretch shown free of a capture race by agreement: what Reel 2
 * found drawing its film in Chromium (scripts/aurixa-reel-2/render.cjs and verify_run.py, docs/brands/aurixa-reel-2
 * /PLAN.md section 9). Pure: the browser and FFmpeg are passed in.
 *
 * Chromium can hand back a capture a moment before every tile in it is painted, even with every compositor stage
 * run before it draws. As the camera pushed in on the Passport's closed cover, about half of fifty frames caught
 * the leaves beneath it through the cover in hard-edged rectangles, and one caught a caption word a step behind.
 * Which drawings it hits changes from run to run, and a larger tile budget does not stop it. So a drawing is
 * captured again, after two of the page's own frames, until two captures in a row agree:
 *
 *   - the same bytes: one drawing;
 *   - the capture before last again: a drawing at rest between two paintings (a thin rotated line Chromium drew
 *     at two scales on alternate frames, never more than 9 code values apart), which a race, a one-off, never makes;
 *   - no value more than JITTER apart: one drawing whose hairline jitters on every capture (never more than 16
 *     code values), where a race is tens to hundreds of code values out, on a hole or a word.
 *
 * A race is unlikely after that, and agreement shows a stretch is free of one: a sample of its frames is drawn
 * again by a browser of its own, and where two draws disagree a third votes. Two sound draws of a frame differ
 * at most at letter and image edges, where Chromium paints a scaled page at a scale that depends on what it
 * painted before: measured at up to 708 pixels of a 1080 x 1920 frame off by more than 12 code values. A caption
 * word a step behind measured 1,113 and more, and a hole 175,000 and more. So frames within TOLERANCE of each
 * other everywhere, or off by more than EDGE_LEVEL on no more than EDGE_SHARE of their pixels (900 of a
 * 1080 x 1920 frame), are one answer.
 */
export const SETTLE = { tries: 6, jitter: 16 };
export const AGREEMENT = { tolerance: 2, edgeLevel: 12, edgeShare: 900 / (1080 * 1920) };

/** A capture's pixels: 8-bit RGB or RGBA, as Chromium writes them. Null for anything else. */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      const interlace = body[12];
      if (depth !== 8 || interlace !== 0) return null;
      channels = colour === 2 ? 3 : colour === 6 ? 4 : 0;
      if (!channels) return null;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || !idat.length) return null;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    const up = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? data[row + x - channels] : 0;
      const b = y > 0 ? data[up + x] : 0;
      const c = x >= channels && y > 0 ? data[up + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) return null;
      data[row + x] = value & 0xff;
    }
  }
  return { width, height, channels, data };
}

/** Whether two captures (PNG) are one drawing within a hairline's jitter: no value more than `jitter` apart. */
export function withinJitter(a, b, jitter = SETTLE.jitter) {
  const x = decodePng(a);
  const y = decodePng(b);
  if (!x || !y || x.width !== y.width || x.height !== y.height || x.channels !== y.channels) return false;
  const p = x.data;
  const q = y.data;
  for (let i = 0; i < p.length; i += 1) if (Math.abs(p[i] - q[i]) > jitter) return false;
  return true;
}

/**
 * A drawing, captured until two captures in a row agree (above). `capture()` gives a PNG; `pause()` lets the page
 * draw two of its own frames. Returns the drawing kept; `retries`, how many captures it took beyond the two that
 * every drawing takes (0: the second agreed with the first); `captures`, all of them; whether it settled (else
 * the last capture, after `tries` more than the first); and whether it settled within the jitter.
 */
export async function settleCapture({ capture, pause, tries = SETTLE.tries, jitter = SETTLE.jitter }) {
  let a = await capture();
  const seen = [a];
  for (let retries = 0; retries < tries; retries += 1) {
    await pause();
    const b = await capture();
    const captures = retries + 2;
    if (a.equals(b) || (seen.length > 1 && seen.at(-2).equals(b)))
      return { png: b, retries, captures, settled: true, jittered: false };
    if (withinJitter(a, b, jitter)) return { png: b, retries, captures, settled: true, jittered: true };
    a = b;
    seen.push(b);
  }
  return { png: a, retries: tries, captures: tries + 1, settled: false, jittered: false };
}

/** What settling took over a run of drawings, as the render's metadata reports it. */
export class SettleRecord {
  constructor() {
    this.recaptured = new Map();
    this.unsettled = new Set();
    this.captures = 0;
    this.ms = 0;
    this.jittered = 0;
  }

  /** One drawing of frame `frame`: its outcome (settleCapture's) and how long its captures took. */
  add(frame, outcome, ms) {
    this.captures += outcome.captures;
    this.ms += ms;
    if (outcome.retries) this.recaptured.set(frame, (this.recaptured.get(frame) ?? 0) + outcome.retries);
    if (!outcome.settled) this.unsettled.add(frame);
    if (outcome.jittered) this.jittered += 1;
  }

  report() {
    const frames = [...this.recaptured.keys()].sort((a, b) => a - b);
    return {
      frames_recaptured: frames.length,
      // Each frame whose drawings had to be captured again, and how many times.
      recaptured: Object.fromEntries(frames.map((frame) => [String(frame), this.recaptured.get(frame)])),
      unsettled: [...this.unsettled].sort((a, b) => a - b),
      settled_within_jitter: this.jittered,
      captures: this.captures,
      capture_ms_mean: this.captures ? Math.round(this.ms / this.captures) : null,
    };
  }
}

/**
 * Whether two frames (RGB, the same size) are one answer: within `tolerance` everywhere, or off by more than
 * `edgeLevel` on no more than `edgeShare` of their pixels. With the counts, to say how far apart they were.
 */
export function sameFrame(a, b, { width, height, channels = 3 }, rule = AGREEMENT) {
  if (a.length !== b.length || a.length !== width * height * channels) return { same: false, largest: 255, edge: width * height };
  let largest = 0;
  let edge = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    let worst = 0;
    for (let k = 0; k < channels; k += 1) {
      const d = Math.abs(a[pixel * channels + k] - b[pixel * channels + k]);
      if (d > worst) worst = d;
    }
    if (worst > largest) largest = worst;
    if (worst > rule.edgeLevel) edge += 1;
  }
  const allowed = Math.round(rule.edgeShare * width * height);
  return { same: largest <= rule.tolerance || edge <= allowed, largest, edge, allowed };
}

/**
 * The frames of [from, to) to draw again: every frame the settle check had to capture again, its neighbours, and
 * a seeded share of the rest, so the vote also covers frames it passed first time. The seed makes it the same
 * frames every time for the same stretch.
 */
export function framesToVerify({ from, to, recaptured = [], share = 0.05, seed = "" }) {
  const near = new Set();
  for (const frame of recaptured)
    for (const f of [frame - 1, frame, frame + 1]) if (f >= from && f < to) near.add(f);
  const rest = [];
  for (let f = from; f < to; f += 1) if (!near.has(f)) rest.push(f);
  const random = seeded(`${seed} ${from}-${to}`);
  const count = Math.min(rest.length, Math.round(share * rest.length));
  // A partial Fisher-Yates: the first `count` of a seeded shuffle.
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (rest.length - i));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...new Set([...near, ...rest.slice(0, count)])].sort((a, b) => a - b);
}

/** A seeded generator in [0, 1): mulberry32 over an FNV-1a hash of the seed. */
function seeded(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A frame put to the vote: each draw's frame (RGB) grouped with the ones it agrees with; the answer two or more
 * give wins. Returns which draw's frame stands ("run" when the first, the run's own, is in the winning group),
 * the groups by name, and whether no two agreed (unresolved: the run's frame stands, and is reported).
 */
export function vote(draws, shape, rule = AGREEMENT) {
  const groups = [];
  for (const draw of draws) {
    const group = groups.find((g) => sameFrame(g[0].frame, draw.frame, shape, rule).same);
    if (group) group.push(draw);
    else groups.push([draw]);
  }
  groups.sort((a, b) => b.length - a.length);
  const names = groups.map((g) => g.map((draw) => draw.name));
  const [best, second] = groups;
  if (best.length < 2 || (second && second.length === best.length)) return { winner: draws[0].name, unresolved: true, groups: names };
  return { winner: best.some((draw) => draw === draws[0]) ? draws[0].name : best[0].name, unresolved: false, groups: names };
}
