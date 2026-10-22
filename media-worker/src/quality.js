import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { ffmpeg, run } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { alignSpeech } from "./voice.js";
import { enterWorkspace } from "./workspace.js";

/**
 * Measuring a render (feature "render_quality"): what eyes miss, as numbers.
 *
 * Reel 1's film_qc.py (scripts/aurixa-reel-1) measured its master against
 * the lossless frames it was made from, decoded as a player decodes it, and
 * found what no one had seen: the double encode's softness, a brand colour
 * one level off. Every Editor render now does the same against its own
 * lossless reference: the final pass's picture before its encode, made again
 * from the same inputs and the same filter graph (deterministic, so frame for
 * frame what the encoder was given) and compared with the master decoded.
 * At standard quality the clips were encoded once before that picture, which
 * this doesn't count; a master's lossless clips leave nothing uncounted.
 *
 *   fidelity   SSIM and PSNR (RGB), frame by frame: every frame of an edit up
 *              to FIDELITY_FRAMES, an even sample of a longer one
 *   edges      the share of the reference's edge contrast the master keeps
 *   colour     CIEDE2000 on flat fields, and on the brand kit's own colours
 *   banding    gentle gradients, as their smoothed difference
 *   captions   each caption on the frames it was planned for
 *   cuts       each cut on its frame
 *   sync       each voiceover where it was placed, against the picture
 *   loudness   integrated, range and true peak
 *
 * The pixel measures (colour, edges, banding) run here on PIXEL_FRAMES full
 * frames spread over the edit; captions and cuts on a small grey copy of every
 * frame. Each measure is judged against a threshold (THRESHOLDS, with its
 * reason) as a pass, a flag or, where there's nothing to judge, information.
 * Measuring is never worth a failed render: one that can't be measured says
 * so and the render stands.
 */

/**
 * Where a measurement turns into a flag, from film_qc.py's measures of Reel 1
 * and its numbers (HANDOVER.md 1.4 step 16 and 1.5):
 */
export const THRESHOLDS = {
  /** SSIM, mean: Reel 1's master measured 0.989 to 0.990 and the Editor's double encode 0.988; a picture visibly softer than its reference falls below 0.98. */
  ssimMean: 0.98,
  /** PSNR, mean (dB): the master 43.9 to 44.3, the double encode 42.6; below 40 the loss starts to show in fine detail. */
  psnrMean: 40,
  /** PSNR, worst frame (dB): no frame of the master went below 39.2; a frame below 37 is one where the loss can be seen on a still. */
  psnrWorst: 37,
  /** Edge contrast kept, mean: the master kept 99.7% (no frame below 98.3%); 98% is where text and rules start to look soft. */
  edgesMean: 0.98,
  /** Edge contrast kept, worst frame: a frame that lost a twentieth of its edge contrast is visibly softer than the rest. */
  edgesWorst: 0.95,
  /** CIEDE2000 on flat fields, mean: about 1 is a difference people just notice; the master measured 0.41. */
  deltaEMean: 1,
  /** CIEDE2000 between a brand colour in the reference and in the master: the master kept every one within 0.05 (one level). */
  brandDeltaE: 1,
  /**
   * Banding: in gentle gradients, the difference between the master's and the
   * reference's picture smoothed over 16 x 32 pixels (its 99th percentile), in
   * code values (0-255). An encoder bands a gradient by flattening its dither
   * into steps; measured on a dithered dark glow and on footage-like noise,
   * the master's encode left 0.23 and 0.38, the standard double encode 0.42
   * and 0.69, and x264 veryfast at CRF 26 0.73 and 1.58. A code value is a
   * step people see in a dark gradient on a phone.
   */
  bandingGap: 1,
  /** Loudness, integrated, against the edit's target (LU): the render evens it out to the target, so more than a unit off is a fault. */
  loudnessTolerance: 1,
  /** True peak (dBTP): the render limits it to -1.5; AAC can raise a peak a little, so above -1 is a fault. */
  truePeakMax: -1,
  /** A voiceover's offset from where it was placed (ms): Reel 1's was 0; 20 ms is about half a frame, and under what people notice. */
  syncMs: 20,
};

/** Frames compared for SSIM and PSNR: every frame up to this many (a minute at 30 fps), an even sample beyond. */
export const FIDELITY_FRAMES = 1800;
/** Full frames looked at for colour, edges and banding, spread evenly over the edit. */
export const PIXEL_FRAMES = 90;
/** Brand colours checked at most. */
export const BRAND_COLOURS = 12;

function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

/**
 * The render's `measure` parameter: measure it, and the brand kit's colours
 * to look for (each #rrggbb). Null when the app doesn't ask.
 */
export function planMeasurement(params) {
  const p = params && typeof params === "object" ? params : {};
  const raw = p.measure;
  if (raw === undefined || raw === null || raw === false) return { measure: null };
  const value = raw === true ? {} : raw;
  if (typeof value !== "object" || Array.isArray(value)) throw bad("measure must be an object");
  const colours = value.brand_colours ?? [];
  if (!Array.isArray(colours) || colours.length > BRAND_COLOURS)
    throw bad(`measure brand_colours must be a list of at most ${BRAND_COLOURS} colours`);
  const brandColours = [];
  for (const colour of colours) {
    if (typeof colour !== "string" || !/^#[0-9a-f]{6}$/i.test(colour))
      throw bad("measure brand_colours must be colours like #1a2b3c");
    const hex = colour.toLowerCase();
    if (!brandColours.includes(hex)) brandColours.push(hex);
  }
  return { measure: { brandColours } };
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/** sRGB's transfer undone, for each 8-bit level. */
const LINEAR = Float64Array.from({ length: 256 }, (_, level) => {
  const c = level / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const WHITE = [0.95047, 1, 1.08883];
const labF = (t) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);

/** CIE Lab (D65) of an 8-bit sRGB colour, as [L, a, b]. */
export function srgbToLab(r, g, b) {
  const lr = LINEAR[r];
  const lg = LINEAR[g];
  const lb = LINEAR[b];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE[0];
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / WHITE[1];
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE[2];
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const RAD = Math.PI / 180;

/**
 * CIEDE2000 between two Lab colours (Sharma, Wu and Dalal, 2005): about 1 is
 * a difference people just notice. Checked against their published pairs.
 */
export function ciede2000([l1, a1, b1], [l2, a2, b2]) {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b, a) => (b === 0 && a === 0 ? 0 : (((Math.atan2(b, a) / RAD) % 360) + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const chromatic = c1p * c2p !== 0;
  let dh = 0;
  if (chromatic) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dL = l2 - l1;
  const dC = c2p - c1p;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh * RAD) / 2);
  const lBar = (l1 + l2) / 2;
  const cBar = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (chromatic) {
    if (Math.abs(h1p - h2p) <= 180) hBar = (h1p + h2p) / 2;
    else hBar = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * RAD) +
    0.24 * Math.cos(2 * hBar * RAD) +
    0.32 * Math.cos((3 * hBar + 6) * RAD) -
    0.2 * Math.cos((4 * hBar - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt = -Math.sin(2 * dTheta * RAD) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** A #rrggbb colour as [r, g, b]. */
export function hexToRgb(hex) {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
}

/** [r, g, b] (any real numbers) as #rrggbb, rounded and kept to 0-255. */
export function rgbToHex(rgb) {
  return `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** CIEDE2000 between two 8-bit sRGB colours, each [r, g, b]. */
export function deltaE(x, y) {
  return ciede2000(srgbToLab(...x), srgbToLab(...y));
}

/**
 * CIEDE2000 of 8-bit colour pairs, remembered: a frame's flat fields are a
 * few colours over and over, so most pairs are worked out once.
 */
export class DeltaECache {
  constructor(limit = 1 << 20) {
    this.limit = limit;
    this.values = new Map();
  }

  get(r1, g1, b1, r2, g2, b2) {
    const key = ((r1 << 16) | (g1 << 8) | b1) * 16777216 + ((r2 << 16) | (g2 << 8) | b2);
    let value = this.values.get(key);
    if (value === undefined) {
      value = r1 === r2 && g1 === g2 && b1 === b2 ? 0 : deltaE([r1, g1, b1], [r2, g2, b2]);
      if (this.values.size >= this.limit) this.values.clear();
      this.values.set(key, value);
    }
    return value;
  }
}

/* ------------------------------------------------------------------ */
/* A frame against its reference                                       */
/* ------------------------------------------------------------------ */

/** Luma (BT.709 weights) of an RGB24 picture held at `offset` in rows of `stride` bytes. */
function lumaInto(out, bytes, width, height, stride, offset) {
  for (let y = 0; y < height; y += 1) {
    let from = y * stride + offset;
    const row = y * width;
    for (let x = 0; x < width; x += 1, from += 3)
      out[row + x] = 0.2126 * bytes[from] + 0.7152 * bytes[from + 1] + 0.0722 * bytes[from + 2];
  }
}

/** Gradient magnitude (central differences) of a luma plane, 0 on its border. */
function gradientInto(out, luma, width, height) {
  out.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const at = row + x;
      const gx = (luma[at + 1] - luma[at - 1]) / 2;
      const gy = (luma[at + width] - luma[at - width]) / 2;
      out[at] = Math.sqrt(gx * gx + gy * gy);
    }
  }
}

/** An edge strong enough to be text, a rule or a border (film_qc.py's): grain and dither are far below it. */
export const STRONG_EDGE = 24;
/** A flat field: its 3 x 3 neighbourhood within this many levels, in every channel. */
const FLAT_TOLERANCE = 1;
/** Flat fields are looked at on every third pixel, across and down: a frame still gives hundreds of thousands. */
const FLAT_STEP = 3;
/** A brand colour is taken to be on screen where a flat field is within this of it (CIEDE2000). */
export const BRAND_MATCH = 3;
/**
 * Banding windows: 32 x 32 pixels, every 16, compared in halves (16 x 32 and 32 x 16), each made of
 * 16 x 16 blocks. Bands are wide (a dark gradient's steps are tens of pixels apart), and a half this
 * size averages a reference's own grain down to a tenth of a level, where a 16-pixel window left a
 * third of one on footage-like noise.
 */
const BAND_BLOCK = 16;
/** A gentle gradient: no pixel of the window steeper than this (levels a pixel; dither stays under it), */
const BAND_STEEPEST = 4;
/** little grain (its mean gradient, levels a pixel: a dither of a level or so, not footage's noise), */
const BAND_GRAIN = 1;
/** and a slope across it of at least this (levels, halves against halves): not a flat field. */
const BAND_SLOPE = 0.5;
const DE_BIN = 0.01;
const DE_BINS = 3000;
const GAP_BIN = 0.01;
const GAP_BINS = 2000;

/**
 * The pixel measures, gathered frame pair by frame pair (each a reference
 * and its master, RGB24, side by side), never holding more than one: CIEDE2000
 * on flat fields as a histogram, the edge contrast each frame keeps, the brand
 * colours where they are on screen, and banding in gentle gradients.
 */
export class PixelMeter {
  /** `moving(frame)`: frames inside a transition or the edit's fades, left out of banding (see addBanding). */
  constructor(width, height, brandColours = [], moving = () => false) {
    this.moving = moving;
    this.width = width;
    this.height = height;
    const pixels = width * height;
    this.refLuma = new Float32Array(pixels);
    this.masterLuma = new Float32Array(pixels);
    this.refGrad = new Float32Array(pixels);
    // Banding's 16 x 16 blocks: their reference and master luma, the reference's grain and steepest pixel.
    this.columns = Math.floor(width / BAND_BLOCK);
    this.rows = Math.floor(height / BAND_BLOCK);
    const blocks = this.columns * this.rows;
    this.blockRef = new Float64Array(blocks);
    this.blockMaster = new Float64Array(blocks);
    this.blockGrain = new Float64Array(blocks);
    this.blockSteepest = new Float32Array(blocks);
    this.cache = new DeltaECache();
    this.deHistogram = new Float64Array(DE_BINS + 1);
    this.deSum = 0;
    this.deMax = 0;
    this.deBelow1 = 0;
    this.flatPixels = 0;
    this.edges = [];
    this.gapHistogram = new Float64Array(GAP_BINS + 1);
    this.gapWindows = 0;
    this.gapMax = { value: 0, frame: null };
    this.brands = brandColours.map((hex) => ({
      hex,
      rgb: hexToRgb(hex),
      lab: srgbToLab(...hexToRgb(hex)),
      frames: 0,
      pixels: 0,
      reference: [0, 0, 0],
      master: [0, 0, 0],
    }));
    /** Which brand colour (index) each reference colour is, worked out once: -1 for none. */
    this.brandOf = new Map();
    this.frames = 0;
  }

  /** One frame pair: `bytes` holds the reference on the left and the master on the right. */
  add(bytes, frame) {
    const { width, height } = this;
    const stride = width * 6;
    this.frames += 1;
    lumaInto(this.refLuma, bytes, width, height, stride, 0);
    lumaInto(this.masterLuma, bytes, width, height, stride, width * 3);
    gradientInto(this.refGrad, this.refLuma, width, height);
    this.addEdges(frame);
    this.addFlatFields(bytes, stride);
    // A dissolve or fade changes every frame a little, and an encoder lets smooth areas lag the blend by a
    // level or so: that measures how it tracks a fade, not banding, so those frames are left out of it.
    if (!this.moving(frame)) this.addBanding(frame);
  }

  /** The master's edge contrast against the reference's, where the reference has strong edges. */
  addEdges(frame) {
    const { width, masterLuma: luma } = this;
    let ref = 0;
    let master = 0;
    let count = 0;
    for (let at = 0; at < this.refGrad.length; at += 1) {
      const g = this.refGrad[at];
      if (g < STRONG_EDGE) continue;
      // The master's own gradient there (the reference's border is 0, so `at` is never on an edge of the frame).
      const gx = (luma[at + 1] - luma[at - 1]) / 2;
      const gy = (luma[at + width] - luma[at - width]) / 2;
      ref += g;
      master += Math.sqrt(gx * gx + gy * gy);
      count += 1;
    }
    // A frame with no strong edge (a night sky, a fade) says nothing about sharpness.
    if (count >= 100 && ref > 0) this.edges.push({ frame, kept: master / ref });
  }

  /** CIEDE2000 between reference and master on the reference's flat fields, and the brand colours there. */
  addFlatFields(bytes, stride) {
    const { width, height } = this;
    const right = width * 3;
    const seen = this.brands.map(() => ({ pixels: 0, reference: [0, 0, 0], master: [0, 0, 0] }));
    for (let y = 1; y < height - 1; y += FLAT_STEP) {
      for (let x = 1; x < width - 1; x += FLAT_STEP) {
        const at = y * stride + x * 3;
        const r = bytes[at];
        const g = bytes[at + 1];
        const b = bytes[at + 2];
        let flat = true;
        for (let dy = -1; dy <= 1 && flat; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const near = at + dy * stride + dx * 3;
            if (
              Math.abs(bytes[near] - r) > FLAT_TOLERANCE ||
              Math.abs(bytes[near + 1] - g) > FLAT_TOLERANCE ||
              Math.abs(bytes[near + 2] - b) > FLAT_TOLERANCE
            ) {
              flat = false;
              break;
            }
          }
        }
        if (!flat) continue;
        const mr = bytes[at + right];
        const mg = bytes[at + right + 1];
        const mb = bytes[at + right + 2];
        const de = this.cache.get(r, g, b, mr, mg, mb);
        this.flatPixels += 1;
        this.deSum += de;
        if (de < 1) this.deBelow1 += 1;
        if (de > this.deMax) this.deMax = de;
        this.deHistogram[Math.min(DE_BINS, Math.floor(de / DE_BIN))] += 1;
        if (!this.brands.length) continue;
        const key = (r << 16) | (g << 8) | b;
        let brand = this.brandOf.get(key);
        if (brand === undefined) {
          brand = -1;
          let closest = BRAND_MATCH;
          const lab = srgbToLab(r, g, b);
          for (const [index, colour] of this.brands.entries()) {
            const distance = ciede2000(lab, colour.lab);
            if (distance <= closest) {
              closest = distance;
              brand = index;
            }
          }
          this.brandOf.set(key, brand);
        }
        if (brand < 0) continue;
        const hit = seen[brand];
        hit.pixels += 1;
        hit.reference[0] += r;
        hit.reference[1] += g;
        hit.reference[2] += b;
        hit.master[0] += mr;
        hit.master[1] += mg;
        hit.master[2] += mb;
      }
    }
    // A colour counts on a frame where it covers a patch (50 sampled pixels, about 200 on screen), as film_qc.py did.
    for (const [index, hit] of seen.entries()) {
      if (hit.pixels < 50) continue;
      const brand = this.brands[index];
      brand.frames += 1;
      brand.pixels += hit.pixels;
      for (let c = 0; c < 3; c += 1) {
        brand.reference[c] += hit.reference[c];
        brand.master[c] += hit.master[c];
      }
    }
  }

  /** The smoothed difference between master and reference in the reference's gentle gradients (see BAND_BLOCK). */
  addBanding(frame) {
    const { width, columns, rows, blockRef, blockMaster, blockGrain, blockSteepest } = this;
    const B = BAND_BLOCK;
    for (let by = 0; by < rows; by += 1)
      for (let bx = 0; bx < columns; bx += 1) {
        let ref = 0;
        let master = 0;
        let grain = 0;
        let steepest = 0;
        for (let y = by * B; y < by * B + B; y += 1) {
          const row = y * width + bx * B;
          for (let at = row; at < row + B; at += 1) {
            ref += this.refLuma[at];
            master += this.masterLuma[at];
            const g = this.refGrad[at];
            grain += g;
            if (g > steepest) steepest = g;
          }
        }
        const block = by * columns + bx;
        blockRef[block] = ref;
        blockMaster[block] = master;
        blockGrain[block] = grain;
        blockSteepest[block] = steepest;
      }
    const half = B * B * 2;
    for (let by = 0; by + 1 < rows; by += 1)
      for (let bx = 0; bx + 1 < columns; bx += 1) {
        const a = by * columns + bx;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if (
          Math.max(blockSteepest[a], blockSteepest[b], blockSteepest[c], blockSteepest[d]) >
          BAND_STEEPEST
        )
          continue;
        if (
          (blockGrain[a] + blockGrain[b] + blockGrain[c] + blockGrain[d]) / (2 * half) >
          BAND_GRAIN
        )
          continue;
        // The window's halves: left and right, top and bottom.
        const refHalves = [
          blockRef[a] + blockRef[c],
          blockRef[b] + blockRef[d],
          blockRef[a] + blockRef[b],
          blockRef[c] + blockRef[d],
        ];
        if (
          Math.abs(refHalves[0] - refHalves[1]) / half +
            Math.abs(refHalves[2] - refHalves[3]) / half <
          BAND_SLOPE
        )
          continue;
        const masterHalves = [
          blockMaster[a] + blockMaster[c],
          blockMaster[b] + blockMaster[d],
          blockMaster[a] + blockMaster[b],
          blockMaster[c] + blockMaster[d],
        ];
        let gap = 0;
        for (let side = 0; side < 4; side += 1)
          gap = Math.max(gap, Math.abs(masterHalves[side] - refHalves[side]) / half);
        this.gapWindows += 1;
        this.gapHistogram[Math.min(GAP_BINS, Math.floor(gap / GAP_BIN))] += 1;
        if (gap > this.gapMax.value) this.gapMax = { value: gap, frame };
      }
  }

  /** What was measured, as the report gives it. */
  summary(fps) {
    const at = (frame) =>
      frame === null ? null : { frame, time: Number((frame / fps).toFixed(3)) };
    const quantile = (histogram, count, bin, share) => {
      if (!count) return null;
      let seen = 0;
      for (let index = 0; index < histogram.length; index += 1) {
        seen += histogram[index];
        if (seen >= share * count) return Number(((index + 1) * bin).toFixed(3));
      }
      return Number((histogram.length * bin).toFixed(3));
    };
    const edges = this.edges.length
      ? (() => {
          const worst = this.edges.reduce((low, entry) => (entry.kept < low.kept ? entry : low));
          const mean = this.edges.reduce((sum, entry) => sum + entry.kept, 0) / this.edges.length;
          return {
            frames: this.edges.length,
            mean: round4(mean),
            min: round4(worst.kept),
            worst: at(worst.frame),
          };
        })()
      : { frames: 0, mean: null, min: null, worst: null };
    return {
      frames: this.frames,
      edges,
      colour: {
        flat_pixels: this.flatPixels,
        delta_e_2000: this.flatPixels
          ? {
              mean: round3(this.deSum / this.flatPixels),
              p99: quantile(this.deHistogram, this.flatPixels, DE_BIN, 0.99),
              max: round3(this.deMax),
              share_below_1: round4(this.deBelow1 / this.flatPixels),
            }
          : null,
      },
      brand_colours: this.brands.map((brand) => {
        if (!brand.pixels) return { hex: brand.hex, found: false };
        const reference = brand.reference.map((sum) => sum / brand.pixels);
        const master = brand.master.map((sum) => sum / brand.pixels);
        const refLab = labOfMean(reference);
        return {
          hex: brand.hex,
          found: true,
          frames: brand.frames,
          pixels: brand.pixels,
          reference: rgbToHex(reference),
          master: rgbToHex(master),
          // What the encode did to it, and how far the edit drew it from the kit's own value.
          delta_e_2000: round3(ciede2000(refLab, labOfMean(master))),
          drawn_delta_e_2000: round3(ciede2000(brand.lab, refLab)),
        };
      }),
      banding: {
        windows: this.gapWindows,
        gap_code_values: this.gapWindows
          ? {
              p99: quantile(this.gapHistogram, this.gapWindows, GAP_BIN, 0.99),
              max: round3(this.gapMax.value),
            }
          : null,
        worst: this.gapWindows ? at(this.gapMax.frame) : null,
      },
    };
  }
}

/** Lab of a mean colour (real-valued 0-255 channels), through sRGB's transfer exactly. */
function labOfMean(rgb) {
  const linear = rgb.map((value) => {
    const c = Math.max(0, Math.min(255, value)) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [lr, lg, lb] = linear;
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE[0];
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / WHITE[1];
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE[2];
  return [116 * labF(y) - 16, 500 * (labF(x) - labF(y)), 200 * (labF(y) - labF(z))];
}

const round3 = (value) => Number(value.toFixed(3));
const round4 = (value) => Number(value.toFixed(4));

/* ------------------------------------------------------------------ */
/* Captions and cuts, on a small grey copy of every frame              */
/* ------------------------------------------------------------------ */

/** The grey copy is at most a quarter of the frame across and down: cuts read at that size... */
export const TIMING_SCALE = 4;
/** ...and captions while their letters are this tall on it (pixels): smaller, and their strokes blur away. */
const TIMING_TEXT = 16;

/** How many times smaller than the frame its grey copy is: a quarter, or less small for small captions. */
export function timingScale(plan) {
  if (!plan.captions) return TIMING_SCALE;
  const fontSize = Math.min(plan.width, plan.height) * 0.058 * plan.captions.size;
  return Math.max(1, Math.min(TIMING_SCALE, Math.floor(fontSize / TIMING_TEXT)));
}
/** A caption's strokes: gradient at least this (levels a pixel, as film_qc.py's), on the grey copy. */
const TEXT_EDGE = 40;
/** A band already this full of hard edges (their share of its pixels) can't show the words a caption adds. */
const BUSY_BAND = 0.15;

/**
 * Where captions sit on the frame (rows and columns, in the frame's pixels):
 * three lines of them and their outline at the planned size and position, as
 * buildSubtitles (./sequence.js) lays them out, with a little room around.
 */
export function captionBand(plan) {
  if (!plan.captions) return null;
  const { width, height } = plan;
  const short = Math.min(width, height);
  const portrait = height > width;
  const { position, size } = plan.captions;
  const fontSize = Math.round(short * 0.058 * size);
  const marginV =
    position === "bottom"
      ? height * (portrait ? 0.12 : 0.07)
      : position === "lower_third"
        ? height * (portrait ? 0.24 : 0.14)
        : position === "top"
          ? height * (portrait ? 0.14 : 0.08)
          : 0;
  const block = 3.6 * fontSize;
  const pad = 0.4 * fontSize;
  let top;
  if (position === "top") top = marginV;
  else if (position === "center") top = height / 2 - block / 2;
  else top = height - marginV - block;
  const margin = width * 0.08;
  const clampTo = (value, limit) => Math.max(0, Math.min(limit, Math.round(value)));
  return {
    top: clampTo(top - pad, height),
    bottom: clampTo(top + block + pad, height),
    left: clampTo(margin - pad, width),
    right: clampTo(width - margin + pad, width),
  };
}

/** The millisecond each frame is shown at, as the subtitle filter reads it (microsecond time stamps, truncated). */
function frameMs(frame, fps) {
  return Math.floor(Math.round((frame * 1e6) / fps) / 1000);
}

/**
 * Which caption each frame is planned to carry (its index), or -1: a caption
 * shows from its start to its end in whole centiseconds (as the subtitle file
 * gives them), on the frames whose time falls inside.
 */
export function plannedCaptions(plan) {
  const owner = new Int32Array(plan.totalFrames).fill(-1);
  const segments = plan.captions?.segments ?? [];
  for (const [index, segment] of segments.entries()) {
    const from = Math.round(segment.start * 100) * 10;
    const to = Math.round(segment.end * 100) * 10;
    const first = Math.max(0, Math.floor((from / 1000) * plan.fps) - 1);
    for (let frame = first; frame < plan.totalFrames; frame += 1) {
      const at = frameMs(frame, plan.fps);
      if (at >= to) break;
      if (at >= from && owner[frame] === -1) owner[frame] = index;
    }
  }
  return owner;
}

/** Frames inside a transition between clips, or the edit's own fades in and out, as a set. */
export function movingFrames(plan) {
  const moving = new Set();
  for (const clip of plan.clips)
    for (let frame = clip.startFrame; frame < clip.startFrame + clip.transitionFrames; frame += 1)
      moving.add(frame);
  const intro = Math.ceil(plan.introFade * plan.fps);
  const outro = Math.floor((plan.total - plan.outroFade) * plan.fps);
  for (let frame = 0; frame < intro; frame += 1) moving.add(frame);
  if (plan.outroFade > 0)
    for (let frame = outro; frame < plan.totalFrames; frame += 1) moving.add(frame);
  return moving;
}

/** Which clip (its index) shows each frame: the later one where two cross. */
export function clipOfFrames(plan) {
  const owner = new Int32Array(plan.totalFrames).fill(-1);
  for (const [index, clip] of plan.clips.entries())
    for (
      let frame = Math.max(0, clip.startFrame);
      frame < Math.min(plan.totalFrames, clip.startFrame + clip.durationFrames);
      frame += 1
    )
      owner[frame] = index;
  return owner;
}

/** The frames cuts are planned on: the first frame of each clip that follows the one before with no transition. */
export function plannedCuts(plan) {
  return plan.clips.flatMap((clip, index) =>
    index > 0 && clip.transitionFrames === 0 ? [{ clip: index + 1, frame: clip.startFrame }] : [],
  );
}

/**
 * What the grey copy of each frame shows: how much the picture changed from
 * the frame before (outside the captions, whose changes are their own), and
 * how much of the caption band is the hard edges of text.
 */
export class TimingMeter {
  constructor(plan, width, height) {
    this.width = width;
    this.height = height;
    this.change = new Float32Array(plan.totalFrames);
    this.text = new Float32Array(plan.totalFrames);
    this.previous = null;
    this.frames = 0;
    const band = captionBand(plan);
    const sx = width / plan.width;
    const sy = height / plan.height;
    this.band = band
      ? {
          top: Math.max(1, Math.floor(band.top * sy)),
          bottom: Math.min(height - 1, Math.ceil(band.bottom * sy)),
          left: Math.max(1, Math.floor(band.left * sx)),
          right: Math.min(width - 1, Math.ceil(band.right * sx)),
        }
      : null;
  }

  add(plane, frame) {
    if (frame >= this.change.length) return;
    const { width, height, band } = this;
    this.frames += 1;
    if (this.previous) {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < height; y += 1) {
        if (band && y >= band.top && y < band.bottom) continue;
        const row = y * width;
        for (let x = 0; x < width; x += 1) sum += Math.abs(plane[row + x] - this.previous[row + x]);
        count += width;
      }
      this.change[frame] = count ? sum / count : 0;
    } else {
      this.previous = new Uint8Array(plane.length);
    }
    this.previous.set(plane);
    if (!band) return;
    let strong = 0;
    let count = 0;
    for (let y = band.top; y < band.bottom; y += 1) {
      const row = y * width;
      for (let x = band.left; x < band.right; x += 1) {
        const gx = (plane[row + x + 1] - plane[row + x - 1]) / 2;
        const gy = (plane[row + x + width] - plane[row + x - width]) / 2;
        if (gx * gx + gy * gy >= TEXT_EDGE * TEXT_EDGE) strong += 1;
        count += 1;
      }
    }
    this.text[frame] = count ? strong / count : 0;
  }
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Each caption on its planned frames, judged from the band's text edges as
 * film_qc.py judged Reel 1's. A frame within about 0.13 s of a caption
 * arriving or leaving is a transition and isn't judged. A caption is judged
 * against the frames of its own clips without captions, within two seconds of
 * it, where there are enough of them and the band isn't already full of hard
 * edges (BUSY_BAND): the picture behind the band is then the same, so the
 * words must add their own edges to it (at least a quarter of the caption
 * frames' edge share, and a hundredth of the band). Otherwise against
 * a line read from the whole render, midway (geometrically) between the
 * frames that should carry words and those that shouldn't, when the two can
 * be told apart: a caption whose steady frames mostly fall below it is missed.
 */
export function judgeCaptions(plan, owner, text, clips = clipOfFrames(plan)) {
  const segments = plan.captions?.segments ?? [];
  if (!segments.length) return { status: "none", planned: 0 };
  const frames = owner.length;
  const margin = Math.max(2, Math.round(0.13 * plan.fps));
  const steady = (frame) => {
    const on = owner[frame] >= 0;
    for (
      let near = Math.max(0, frame - margin);
      near <= Math.min(frames - 1, frame + margin);
      near += 1
    )
      if (owner[near] >= 0 !== on) return false;
    return true;
  };
  let first = -1;
  let last = -1;
  for (let frame = 0; frame < frames; frame += 1)
    if (owner[frame] >= 0) {
      if (first === -1) first = frame;
      last = frame;
    }
  const on = [];
  const offInside = [];
  const offOutside = [];
  for (let frame = 0; frame < frames; frame += 1) {
    if (!steady(frame)) continue;
    if (owner[frame] >= 0) on.push(text[frame]);
    else if (frame > first && frame < last) offInside.push(text[frame]);
    else offOutside.push(text[frame]);
  }
  // Frames outside the captions' span stand in for gaps between them when they run back to back.
  const off = offInside.length >= 3 ? offInside : offOutside;
  const withWords = median(on);
  const without = median(off);
  const base = {
    planned: segments.length,
    frames_judged: on.length + off.length,
    edge_share: { with_words: round4(withWords), without_words: round4(without) },
  };
  if (on.length < 3) return { status: "too_short", ...base };
  const threshold =
    withWords >= 1.5 * without + 0.002
      ? Math.sqrt(Math.max(withWords, 1e-6) * Math.max(without, withWords / 400, 1e-6))
      : null;
  const missed = [];
  let judged = 0;
  let short = 0;
  let local = 0;
  let unjudged = 0;
  const reach = Math.round(2 * plan.fps);
  for (const [index, segment] of segments.entries()) {
    const own = [];
    const shots = new Set();
    let firstFrame = -1;
    let lastFrame = -1;
    for (let frame = 0; frame < frames; frame += 1) {
      if (owner[frame] !== index) continue;
      if (firstFrame === -1) firstFrame = frame;
      lastFrame = frame;
      shots.add(clips[frame]);
      if (steady(frame)) own.push(text[frame]);
    }
    if (own.length < 2) {
      short += 1;
      continue;
    }
    const around = [];
    for (
      let frame = Math.max(0, firstFrame - reach);
      frame <= Math.min(frames - 1, lastFrame + reach);
      frame += 1
    )
      if (owner[frame] < 0 && steady(frame) && shots.has(clips[frame])) around.push(text[frame]);
    let shown;
    if (around.length >= 3 && median(around) <= BUSY_BAND) {
      local += 1;
      const mine = median(own);
      shown = mine - median(around) >= Math.max(0.01, mine / 4);
    } else if (threshold !== null) {
      shown = own.filter((value) => value > threshold).length / own.length >= 0.5;
    } else {
      unjudged += 1;
      continue;
    }
    judged += 1;
    if (!shown)
      missed.push({
        caption: index + 1,
        start: round3(segment.start),
        end: round3(segment.end),
        edge_share: round4(median(own)),
        ...(around.length >= 3 && median(around) <= BUSY_BAND
          ? { edge_share_around: round4(median(around)) }
          : {}),
      });
  }
  if (!judged) return { status: "unclear", ...base };
  let between = 0;
  if (threshold !== null)
    for (let frame = first + 1; frame < last; frame += 1)
      if (owner[frame] < 0 && steady(frame) && text[frame] > threshold) between += 1;
  return {
    status: "measured",
    ...base,
    edge_share: { ...base.edge_share, threshold: threshold === null ? null : round4(threshold) },
    judged,
    judged_against_own_clip: local,
    unjudged,
    too_short: short,
    missed: missed.slice(0, 20),
    missed_count: missed.length,
    frames_with_words_between: between,
  };
}

/**
 * Each planned cut, judged by the picture as film_qc.py judged Reel 1's: a
 * cut is the frame in its neighbourhood (6 frames either way) where the
 * picture changes most, by far (four times the next largest change). A
 * larger change on another frame nearby is a cut that missed its frame; a
 * boundary the picture carries through (a join between two takes of one
 * shot) changes no more than its neighbours, and that's as meant.
 */
export function judgeCuts(cuts, change, fps) {
  const frames = change.length;
  const judged = [];
  for (const { clip, frame } of cuts) {
    if (frame < 1 || frame >= frames) continue;
    const near = [];
    for (let at = Math.max(1, frame - 6); at <= Math.min(frames - 1, frame + 6); at += 1)
      near.push([at, change[at]]);
    const others = near.filter(([at]) => at !== frame).map(([, value]) => value);
    const largestOther = others.length ? Math.max(...others) : 0;
    const [top, topValue] = near.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    const sorted = near.map(([, value]) => value).sort((a, b) => b - a);
    let readsAs = "carried_through";
    if (top === frame && change[frame] > 4 * largestOther) readsAs = "cut";
    else if (topValue > 8 && topValue > 4 * (sorted[1] ?? 0)) readsAs = "missed";
    judged.push({
      clip,
      frame,
      time: round3(frame / fps),
      reads_as: readsAs,
      change: round3(change[frame]),
      next_largest_nearby: round3(largestOther),
      ...(readsAs === "missed" ? { found_at: top, frames_off: top - frame } : {}),
    });
  }
  return {
    planned: cuts.length,
    judged: judged.length,
    missed: judged.filter((cut) => cut.reads_as === "missed").length,
    cuts: judged,
  };
}

/* ------------------------------------------------------------------ */
/* Fidelity: SSIM and PSNR, frame by frame                             */
/* ------------------------------------------------------------------ */

/** Frame by frame values from an ssim or psnr stats file, by key: SSIM's "All", PSNR's "mse_avg". */
export function parseStats(text, key) {
  const pattern = new RegExp(`(?:^|\\s)${key}:(\\S+)`);
  const values = [];
  for (const line of String(text).split("\n")) {
    const match = pattern.exec(line);
    if (!match) continue;
    const value = match[1] === "inf" ? Number.POSITIVE_INFINITY : Number(match[1]);
    if (!Number.isNaN(value)) values.push(value);
  }
  return values;
}

/** PSNR (dB) of a mean squared error over 8-bit pictures; 100 for identical ones. */
export function psnrOf(mse) {
  return mse > 0 ? 10 * Math.log10((255 * 255) / mse) : 100;
}

/**
 * The fidelity summary: SSIM's mean and worst, PSNR's (of the mean squared
 * error, as FFmpeg's average is) and worst frame, and the worst frames'
 * times. `every` is how far apart the frames compared are.
 */
export function fidelitySummary(ssim, mse, every, fps) {
  const count = Math.min(ssim.length, mse.length);
  if (!count) return null;
  const frames = Array.from({ length: count }, (_, index) => ({
    frame: index * every,
    ssim: ssim[index],
    psnr: psnrOf(mse[index]),
  }));
  const meanSsim = frames.reduce((sum, entry) => sum + entry.ssim, 0) / count;
  const meanMse = mse.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const entry = (item) => ({
    frame: item.frame,
    time: round3(item.frame / fps),
    ssim: round4(item.ssim),
    psnr_db: Number(item.psnr.toFixed(2)),
  });
  const bySsim = [...frames].sort((a, b) => a.ssim - b.ssim);
  const byPsnr = [...frames].sort((a, b) => a.psnr - b.psnr);
  return {
    frames_measured: count,
    every,
    ssim: {
      mean: round4(meanSsim),
      min: round4(bySsim[0].ssim),
      worst: bySsim.slice(0, 3).map(entry),
    },
    psnr_db: {
      mean: Number(psnrOf(meanMse).toFixed(2)),
      min: Number(byPsnr[0].psnr.toFixed(2)),
      worst: byPsnr.slice(0, 3).map(entry),
    },
  };
}

/**
 * Which frames are measured: for SSIM and PSNR every frame up to
 * FIDELITY_FRAMES, else every `fidelity`-th; for the pixel measures about
 * PIXEL_FRAMES frames, every `pixel`-th from `offset` (both multiples of the
 * first, so they are among the frames compared), starting half a step in.
 */
export function samplingPlan(totalFrames) {
  const fidelity = Math.max(1, Math.ceil(totalFrames / FIDELITY_FRAMES));
  const pixel = Math.max(fidelity, Math.ceil(totalFrames / PIXEL_FRAMES / fidelity) * fidelity);
  const offset = Math.floor(pixel / 2 / fidelity) * fidelity;
  return { fidelity, pixel, offset };
}

/* ------------------------------------------------------------------ */
/* Verdicts                                                            */
/* ------------------------------------------------------------------ */

/** One measure judged: a pass, a flag, or information (nothing to judge it on). */
const verdict = (id, result, value = null, limit = null, extra = {}) => ({
  id,
  result,
  value: typeof value === "number" ? Number(value.toFixed(4)) : value,
  limit,
  ...extra,
});

/** Every measure of a report judged against THRESHOLDS (see there for why each is where it is). */
export function qualityChecks(report) {
  const t = THRESHOLDS;
  const checks = [];
  const fidelity = report.fidelity;
  if (fidelity) {
    checks.push(
      verdict(
        "ssim",
        fidelity.ssim.mean >= t.ssimMean ? "pass" : "flag",
        fidelity.ssim.mean,
        t.ssimMean,
      ),
    );
    checks.push(
      verdict(
        "psnr",
        fidelity.psnr_db.mean >= t.psnrMean ? "pass" : "flag",
        fidelity.psnr_db.mean,
        t.psnrMean,
      ),
    );
    checks.push(
      verdict(
        "psnr_worst",
        fidelity.psnr_db.min >= t.psnrWorst ? "pass" : "flag",
        fidelity.psnr_db.min,
        t.psnrWorst,
        {
          time: fidelity.psnr_db.worst[0]?.time ?? null,
        },
      ),
    );
  }
  const pixels = report.pixels;
  if (pixels) {
    const edges = pixels.edges;
    if (edges.frames) {
      checks.push(
        verdict("edges", edges.mean >= t.edgesMean ? "pass" : "flag", edges.mean, t.edgesMean),
      );
      checks.push(
        verdict(
          "edges_worst",
          edges.min >= t.edgesWorst ? "pass" : "flag",
          edges.min,
          t.edgesWorst,
          {
            time: edges.worst?.time ?? null,
          },
        ),
      );
    } else checks.push(verdict("edges", "info"));
    const de = pixels.colour.delta_e_2000;
    checks.push(
      de
        ? verdict("colour", de.mean < t.deltaEMean ? "pass" : "flag", de.mean, t.deltaEMean)
        : verdict("colour", "info"),
    );
    for (const brand of pixels.brand_colours)
      checks.push(
        brand.found
          ? verdict(
              "brand_colour",
              brand.delta_e_2000 < t.brandDeltaE ? "pass" : "flag",
              brand.delta_e_2000,
              t.brandDeltaE,
              {
                hex: brand.hex,
              },
            )
          : verdict("brand_colour", "info", null, null, { hex: brand.hex }),
      );
    const banding = pixels.banding;
    checks.push(
      banding.windows >= 20
        ? verdict(
            "banding",
            banding.gap_code_values.p99 < t.bandingGap ? "pass" : "flag",
            banding.gap_code_values.p99,
            t.bandingGap,
            { time: banding.worst?.time ?? null },
          )
        : verdict("banding", "info"),
    );
  }
  const captions = report.captions;
  if (captions)
    checks.push(
      captions.status === "measured"
        ? verdict("captions", captions.missed_count ? "flag" : "pass", captions.missed_count, 0)
        : verdict("captions", "info", null, null, { status: captions.status }),
    );
  const cuts = report.cuts;
  if (cuts)
    checks.push(
      cuts.judged
        ? verdict("cuts", cuts.missed ? "flag" : "pass", cuts.missed, 0)
        : verdict("cuts", "info"),
    );
  const sync = report.sync;
  if (sync) {
    const measured = sync.items.filter((item) => item.status === "measured");
    const worst = measured.reduce((most, item) => Math.max(most, Math.abs(item.offset_ms)), 0);
    checks.push(
      measured.length
        ? verdict("sync", worst <= t.syncMs ? "pass" : "flag", worst, t.syncMs)
        : verdict("sync", "info"),
    );
  }
  const loudness = report.loudness;
  if (loudness) {
    if (loudness.integrated_lufs === null) checks.push(verdict("loudness", "info"));
    else {
      const target = loudness.target_lufs;
      checks.push(
        target === null
          ? verdict("loudness", "info", loudness.integrated_lufs)
          : verdict(
              "loudness",
              Math.abs(loudness.integrated_lufs - target) <= t.loudnessTolerance ? "pass" : "flag",
              loudness.integrated_lufs,
              target,
            ),
      );
      checks.push(
        verdict(
          "true_peak",
          loudness.true_peak_dbtp <= t.truePeakMax ? "pass" : "flag",
          loudness.true_peak_dbtp,
          t.truePeakMax,
        ),
      );
    }
  }
  return checks;
}

/** The report's counts, for a line at a glance. */
function tally(checks) {
  return {
    passes: checks.filter((check) => check.result === "pass").length,
    flags: checks.filter((check) => check.result === "flag").length,
  };
}

/** Loudness as the report gives it, from a loudnorm measurement of the master's sound. */
export function loudnessReport(measured, plan) {
  const sounded = Boolean(measured) && Number.isFinite(measured.input_i) && measured.input_i > -70;
  return {
    integrated_lufs: sounded ? Number(measured.input_i.toFixed(1)) : null,
    range_lu: sounded ? Number(measured.input_lra.toFixed(1)) : null,
    true_peak_dbtp: sounded ? Number(measured.input_tp.toFixed(1)) : null,
    target_lufs: plan.normalize ? plan.loudness : null,
  };
}

/* ------------------------------------------------------------------ */
/* The measuring passes                                                */
/* ------------------------------------------------------------------ */

/**
 * The reference and the master decoded as a BT.709 player decodes them: the
 * TV range taken to full RGB, chroma upsampled bilinearly. (zimg agrees to
 * 0.0001 SSIM and 0.2 dB; this needs nothing beyond FFmpeg's own scaler.)
 */
const TO_RGB =
  "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=bilinear+accurate_rnd+full_chroma_int,format=gbrp";

/**
 * Runs FFmpeg with its first output on stdout as raw frames of `frameBytes`,
 * each handed to `onFrame` as it arrives (its buffer is used again after).
 * It runs inside the task's workspace like every FFmpeg the worker starts,
 * and is stopped at a render's time limit, or once nothing new has come for
 * a render's stall limit.
 */
async function streamFrames(args, frameBytes, onFrame) {
  const track = await enterWorkspace();
  const timeoutSeconds = config.renderTimeoutSeconds;
  const stallSeconds = config.renderStallSeconds;
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    track(child);
    const frame = Buffer.alloc(frameBytes);
    let filled = 0;
    let count = 0;
    let stderr = "";
    let problem = null;
    let movedAt = Date.now();
    const stop = (error) => {
      problem ??= error;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(
      () =>
        stop(new TaskError("TASK_TIMEOUT", `ffmpeg exceeded ${timeoutSeconds}s and was stopped`)),
      timeoutSeconds * 1000,
    );
    const watcher = setInterval(
      () => {
        if (Date.now() - movedAt > stallSeconds * 1000)
          stop(
            new TaskError(
              "TASK_STALLED",
              `ffmpeg wrote nothing new for ${stallSeconds}s and was stopped`,
            ),
          );
      },
      Math.max(250, Math.min(30_000, stallSeconds * 250)),
    );
    child.stdout.on("data", (chunk) => {
      movedAt = Date.now();
      let offset = 0;
      while (offset < chunk.length && !problem) {
        const take = Math.min(chunk.length - offset, frameBytes - filled);
        chunk.copy(frame, filled, offset, offset + take);
        filled += take;
        offset += take;
        if (filled < frameBytes) continue;
        try {
          onFrame(frame, count);
        } catch (error) {
          stop(error);
        }
        count += 1;
        filled = 0;
      }
    });
    child.stderr.on("data", (chunk) => {
      movedAt = Date.now();
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      clearInterval(watcher);
      reject(new TaskError("WORKER_ERROR", "ffmpeg is not available in this image"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(watcher);
      if (problem) reject(problem);
      else if (code === 0) resolve({ frames: count, stderr });
      else
        reject(
          new TaskError(
            "RENDER_FAILED",
            `ffmpeg failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`,
          ),
        );
    });
  });
}

/**
 * The reference made again beside the master: the final pass's own inputs
 * and filter graph (its argument list, as it ran), its picture compared with
 * the master decoded, frame index against frame index (never time stamps,
 * which round). SSIM and PSNR go to stats files frame by frame; the frames the
 * pixel measures look at come out on stdout, reference and master side by
 * side. Whatever else the graph makes (its sound) goes to a null output.
 */
export function fidelityArgs(finalArgv, master, plan, { ssimPath, psnrPath, sampling }) {
  const at = finalArgv.indexOf("-filter_complex");
  if (at < 0) throw new TaskError("RENDER_FAILED", "The final pass has no filter graph to measure");
  const inputs = finalArgv.slice(0, at);
  const graph = finalArgv[at + 1];
  const labels = [];
  for (let index = at + 2; index < finalArgv.length - 1; index += 1)
    if (finalArgv[index] === "-map" && /^\[[\w.-]+\]$/.test(finalArgv[index + 1]))
      labels.push(finalArgv[index + 1]);
  const [picture, ...others] = labels;
  if (!picture) throw new TaskError("RENDER_FAILED", "The final pass has no picture to measure");
  const masterInput = inputs.filter((arg) => arg === "-i").length;
  const pace = `settb=1/${plan.fps},setpts=N`;
  const compared = sampling.fidelity > 1 ? `,select=not(mod(pts\\,${sampling.fidelity}))` : "";
  const looked = `select=eq(mod(pts\\,${sampling.pixel})\\,${sampling.offset})`;
  const lines = [
    graph,
    `${picture}${pace}${compared},${TO_RGB},split=3[qr1][qr2][qr3]`,
    `[${masterInput}:v]${pace}${compared},${TO_RGB},split=2[qm1][qm2]`,
    `[qm1][qr1]ssim=stats_file=${ssimPath}:shortest=1[qs]`,
    `[qs][qr2]psnr=stats_file=${psnrPath}:shortest=1[qp]`,
    `[qr3]${looked}[qrs]`,
    `[qm2]${looked}[qms]`,
    `[qrs][qms]hstack=inputs=2:shortest=1,format=rgb24[qpair]`,
  ];
  return [
    ...inputs,
    "-i",
    master,
    "-filter_complex",
    lines.join(";"),
    "-map",
    "[qpair]",
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
    "-map",
    "[qp]",
    ...others.flatMap((label) => ["-map", label]),
    "-fps_mode",
    "passthrough",
    "-f",
    "null",
    "-",
  ];
}

/** The master's grey copy, every frame, on stdout; and its sound measured for loudness. */
export function timingArgs(master, plan, { width, height, sound }) {
  return [
    "-i",
    master,
    "-filter_complex",
    `[0:v]scale=${width}:${height}:flags=area,format=gray[qt]`,
    "-map",
    "[qt]",
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1",
    ...(sound
      ? [
          "-map",
          "0:a:0",
          "-af",
          `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:print_format=json`,
          "-f",
          "null",
          "-",
        ]
      : []),
  ];
}

/** When the master's picture and sound start, and whether it has sound. */
async function masterStreams(path) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "json", path],
    { timeoutSeconds: 60 },
  );
  const streams = JSON.parse(stdout).streams ?? [];
  const start = (type) => {
    const stream = streams.find((entry) => entry.codec_type === type);
    if (!stream) return null;
    const value = Number(stream.start_time);
    return Number.isFinite(value) ? value : 0;
  };
  return { video: start("video") ?? 0, audio: start("audio") };
}

/** A file's first sound as mono floats at `rate`, from `start` for `seconds` when given. */
async function decodeMono(path, rate, out, { start = null, seconds = null } = {}) {
  await ffmpeg([
    ...(start !== null ? ["-ss", start.toFixed(6)] : []),
    ...(seconds !== null ? ["-t", seconds.toFixed(6)] : []),
    "-i",
    path,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(rate),
    "-f",
    "f32le",
    "-c:a",
    "pcm_f32le",
    out,
  ]);
  const bytes = await readFile(out);
  await rm(out, { force: true });
  const samples = new Float32Array(Math.floor(bytes.length / 4));
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = bytes.readFloatLE(index * 4);
  return samples;
}

/** Voiceovers measured for sync at most: the longest. */
const SYNC_ITEMS = 8;
const SYNC_RATE = 16_000;

/**
 * Each voiceover where it was placed, against the picture: its own file
 * (from its trim, for its length) matched with the master's sound at the
 * time it was placed (voice.js's speech alignment, which survives the mix's
 * music and a change of level). A positive offset: the voice is late.
 */
async function measureSync(plan, sources, master, dir) {
  const items = plan.audio
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.role === "voiceover" && item.volume > 0 && plan.mix.voiceover > 0)
    .sort((a, b) => b.item.length - a.item.length)
    .slice(0, SYNC_ITEMS)
    .sort((a, b) => a.item.start - b.item.start);
  if (!items.length) return null;
  const starts = await masterStreams(master);
  if (starts.audio === null)
    return { items: items.map(({ index }) => ({ item: index + 1, status: "no_sound" })) };
  const mixed = await decodeMono(master, SYNC_RATE, join(dir, "quality-master.f32"));
  const measured = [];
  for (const { item, index } of items) {
    const voice = await decodeMono(
      sources[item.source].path,
      SYNC_RATE,
      join(dir, "quality-voice.f32"),
      {
        start: item.trimStart,
        seconds: item.length,
      },
    );
    const from = Math.max(0, Math.round((starts.video + item.start - starts.audio) * SYNC_RATE));
    const piece = mixed.subarray(from, Math.min(mixed.length, from + voice.length));
    const base = { item: index + 1, start: round3(item.start), seconds: round3(item.length) };
    if (voice.length < SYNC_RATE || piece.length < SYNC_RATE) {
      measured.push({ ...base, status: "too_short" });
      continue;
    }
    const found = alignSpeech(voice, piece, SYNC_RATE, { maxLagSeconds: 0.5 });
    const clear = found.confidence >= 0.5 && found.margin >= 0.08;
    measured.push({
      ...base,
      status: clear ? "measured" : "unclear",
      offset_ms: Number((found.offset_seconds * 1000).toFixed(1)),
      confidence: found.confidence,
    });
  }
  return { items: measured };
}

/**
 * Measures a finished render against its reference (see the top of this
 * file): `finalArgv` is the final pass's argument list as it ran, `master`
 * the file it made, and the final pass's inputs still on disk.
 */
export async function measureRender({
  plan,
  finalArgv,
  master,
  sources,
  dir,
  progress = () => {},
  parseLoudness,
  mastering = null,
}) {
  const started = Date.now();
  const sampling = samplingPlan(plan.totalFrames);
  const ssimPath = join(dir, "quality-ssim.log");
  const psnrPath = join(dir, "quality-psnr.log");
  const moving = movingFrames(plan);
  const pixels = new PixelMeter(
    plan.width,
    plan.height,
    plan.measure?.brandColours ?? [],
    (frame) => moving.has(frame),
  );
  progress(0.9, "Measuring the render against its reference");
  await streamFrames(
    fidelityArgs(finalArgv, master, plan, { ssimPath, psnrPath, sampling }),
    plan.width * 2 * plan.height * 3,
    (bytes, index) => pixels.add(bytes, sampling.offset + index * sampling.pixel),
  );
  const fidelity = fidelitySummary(
    parseStats(await readFile(ssimPath, "utf8"), "All"),
    parseStats(await readFile(psnrPath, "utf8"), "mse_avg"),
    sampling.fidelity,
    plan.fps,
  );
  await rm(ssimPath, { force: true });
  await rm(psnrPath, { force: true });

  progress(0.94, "Measuring the captions, cuts and sound");
  const scale = timingScale(plan);
  const width = Math.max(16, Math.round(plan.width / scale));
  const height = Math.max(16, Math.round(plan.height / scale));
  const timing = new TimingMeter(plan, width, height);
  const sound = (await masterStreams(master)).audio !== null;
  const { stderr } = await streamFrames(
    timingArgs(master, plan, { width, height, sound }),
    width * height,
    (plane, index) => timing.add(plane, index),
  );
  const cuts = plannedCuts(plan);

  progress(0.97, "Measuring the voiceover's sync");
  const sync = await measureSync(plan, sources, master, dir);
  const lossless = mastering?.lossless_clips?.length ?? 0;
  const standard = mastering?.standard_clips?.length ?? plan.clips.length;
  const report = {
    version: 1,
    status: "measured",
    // The final pass's picture before its encode, made again; its clips' own intermediates as they were.
    reference: "final_pass",
    intermediates:
      plan.quality !== "master" || !lossless ? "standard" : standard ? "mixed" : "lossless",
    frames: plan.totalFrames,
    fps: plan.fps,
    fidelity,
    pixels: { every: sampling.pixel, ...pixels.summary(plan.fps) },
    captions: plan.captions ? judgeCaptions(plan, plannedCaptions(plan), timing.text) : null,
    cuts: cuts.length ? judgeCuts(cuts, timing.change, plan.fps) : null,
    sync,
    loudness: loudnessReport(sound ? parseLoudness(stderr) : null, plan),
  };
  const checks = qualityChecks(report);
  return {
    ...report,
    checks,
    ...tally(checks),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  };
}

/** The report of a render that couldn't be measured: it stands, and says so. */
export function unmeasuredQuality(error) {
  const code = error?.code;
  console.error(
    JSON.stringify({
      event: "render_unmeasured",
      code: code ?? null,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return {
    version: 1,
    status: "unmeasured",
    reason: code === "TASK_TIMEOUT" || code === "TASK_STALLED" ? "took too long" : "failed",
    checks: [],
    passes: 0,
    flags: 0,
  };
}

/** The report of a master passed through: its picture is its source's, packet for packet; its sound is measured. */
export function passedThroughQuality(plan, measured) {
  const report = {
    version: 1,
    status: "passed_through",
    reference: "source",
    frames: plan.totalFrames,
    fps: plan.fps,
    loudness: loudnessReport(measured, plan),
  };
  const checks = qualityChecks(report);
  return { ...report, checks, ...tally(checks) };
}
