import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { captionFrame, captionGeometry, panelLook, planBrandCaptions } from "./brand-captions.js";
import { fontFamily, fontMetrics } from "./fonts.js";

/**
 * Brand captions (see ./brand-captions.js) written as ASS events for libass.
 *
 * The words are laid out here, from the font files the render carries, and
 * each is an event of its own at the place the layout gives it: libass
 * places a line's top at \pos and its baseline the font's win ascent below,
 * sizes a font so its win ascent and descent together are the font size,
 * and doesn't kern, so a word's advance is the sum of its characters' and
 * the words land where the layout put them. Every word, panel, hairline
 * and slice of light is sampled at each frame it moves on and held as one
 * event while it doesn't, each event spanning exactly its frames, so a
 * frame shows what the shared state gives at its time: what the Editor's
 * preview draws.
 *
 * Text only ever goes into the subtitle file, never into an FFmpeg argument.
 */

/** libass's \blur N is a Gaussian of standard deviation 0.849 N (2 / sqrt(ln 256)). */
const BLUR_SIGMA = 2 / Math.sqrt(Math.log(256));

const r2 = (value) => String(Math.round(value * 100) / 100);

/** A time as ASS writes it, in centiseconds, as sequence.js writes them. */
function assTime(value) {
  const centiseconds = Math.max(0, Math.round(value * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** A #rrggbb colour as an override tag takes it (&HBBGGRR&). */
function colourTag(hex) {
  return `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();
}

/** An opacity (0-1) as an ASS alpha (&H00& opaque to &HFF& clear). */
function alphaTag(opacity) {
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255);
  return `&H${alpha.toString(16).toUpperCase().padStart(2, "0")}&`;
}

/** A rectangle as an ASS drawing, from its top left corner. */
function rectangle(width, height) {
  return `m 0 0 l ${r2(width)} 0 ${r2(width)} ${r2(height)} 0 ${r2(height)}`;
}

/** A rectangle's border `size` thick, inside its edge: the outer path, and the inner one wound the other way. */
function frameOf(width, height, size) {
  const [w, h, s] = [width, height, Math.min(size, width / 2, height / 2)].map(r2);
  const [iw, ih] = [r2(width - size), r2(height - size)];
  return `m 0 0 l ${w} 0 ${w} ${h} 0 ${h} m ${s} ${s} l ${s} ${ih} ${iw} ${ih} ${iw} ${s}`;
}

/* ------------------------------------------------------------------ */
/* Faces                                                               */
/* ------------------------------------------------------------------ */

/** Metrics for text set where no font file can be read: roughly Inter's. */
const ROUGH = {
  unitsPerEm: 1000,
  ascent: 969,
  descent: 241,
  italic: false,
  advance: (code) => (code === 32 ? 280 : 560),
};

/** Faces for a plan laid out before any font file is read: rough metrics, in Inter. */
export function roughFaces() {
  return { regular: { family: "Inter", metrics: ROUGH }, italic: null };
}

/** A face from a font file: the family it names itself by, and its metrics. */
function faceOf(bytes, fallbackFamily) {
  const metrics = fontMetrics(bytes);
  if (!metrics) return null;
  const named = fontFamily(bytes);
  return {
    family: named && /^[\p{L}\p{N} ._'&+-]{1,80}$/u.test(named) ? named : fallbackFamily,
    metrics,
  };
}

let systemInter = null;

/** The system's Inter (the worker's own typeface, fonts-inter): its regular and italic files. */
async function interFaces() {
  systemInter ??= (async () => {
    const found = { regular: null, italic: null };
    for (const dir of ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/inter"]) {
      const names = await readdir(dir).catch(() => []);
      for (const name of names.sort()) {
        if (!/\.(otf|ttf)$/i.test(name)) continue;
        const bytes = await readFile(join(dir, name)).catch(() => null);
        if (!bytes || fontFamily(bytes) !== "Inter") continue;
        const face = faceOf(bytes, "Inter");
        if (!face || face.metrics.weight !== 400) continue;
        const slot = face.metrics.italic ? "italic" : "regular";
        found[slot] ??= face;
      }
    }
    return found;
  })();
  return systemInter;
}

/**
 * The faces brand captions are set in: the caption family's regular and
 * italic files from those the render carries (`files`: each its declared
 * family and its bytes), else the system's Inter; and, where neither can be
 * read, rough metrics in Inter. A family without an italic file has its
 * italic slanted by the renderer, which keeps the regular's advances.
 */
export async function brandFaces(family, files) {
  const own = files
    .filter((file) => family && file.family === family)
    .map((file) => faceOf(file.bytes, family))
    .filter(Boolean);
  if (own.length) {
    const regular = own.find((face) => !face.metrics.italic) ?? own[0];
    const italic = own.find((face) => face.metrics.italic && face !== regular) ?? null;
    return { regular, italic };
  }
  const inter = await interFaces();
  if (inter.regular) return { regular: inter.regular, italic: inter.italic };
  return roughFaces();
}

/* ------------------------------------------------------------------ */
/* The script                                                          */
/* ------------------------------------------------------------------ */

/**
 * The brand captions' plan for a render: its lines laid out in `faces`, each
 * run's panel looking as `captions.panel` says over the lightness measured
 * behind it (`backdrops`, one a line, null where unmeasured), no run carried
 * across a palette cut (`cuts`).
 */
export function brandCaptionPlan(plan, faces, { backdrops = [], cuts = [] } = {}) {
  const { captions } = plan;
  const geometry = captionGeometry(plan, captions);
  const { em } = geometry;
  const faceFor = (italic) => (italic && faces.italic ? faces.italic : faces.regular);
  const measure = (text, italic) => {
    const { metrics } = faceFor(italic);
    let units = 0;
    for (const char of text) units += metrics.advance(char.codePointAt(0));
    return (units * em) / metrics.unitsPerEm;
  };
  const { metrics } = faces.regular;
  const upper = (text) => (captions.uppercase ? text.toUpperCase() : text);
  const lines = captions.segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: upper(segment.text),
    words: (segment.words ?? []).map((word) => ({ ...word, text: upper(word.text) })),
    emphasis: segment.emphasis ?? null,
  }));
  const colours = {
    color: captions.color,
    accent: captions.accent,
    panelColor: captions.panelColor ?? null,
  };
  return planBrandCaptions(lines, {
    geometry,
    faces: {
      measure,
      ascent: metrics.ascent / metrics.unitsPerEm,
      descent: metrics.descent / metrics.unitsPerEm,
    },
    cuts,
    lookOf: (run) => {
      const measured = run
        .map((index) => backdrops[index])
        .filter((value) => typeof value === "number");
      return panelLook(
        captions.panel ?? "auto",
        measured.length ? Math.max(...measured) : null,
        colours,
      );
    },
  });
}

/**
 * The ASS styles and events for a render's brand captions (see the module
 * comment), in the order they are drawn: panels, then hairlines, words and
 * the light across them.
 */
export function brandCaptionEvents(plan, faces, options = {}) {
  const captionPlan = brandCaptionPlan(plan, faces, options);
  const { em } = captionPlan.geometry;
  const { fps, totalFrames } = plan;
  const faceFor = (italic) => (italic && faces.italic ? faces.italic : faces.regular);
  const sizeOf = ({ metrics }) => (em * (metrics.ascent + metrics.descent)) / metrics.unitsPerEm;
  const ascentOf = ({ metrics }) => (em * metrics.ascent) / metrics.unitsPerEm;
  const styles = [
    `Style: Brand,${faces.regular.family},${r2(sizeOf(faces.regular))},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
  ];

  const kinds = ["panel", "frame", "hairline", "word", "light"];
  const events = Object.fromEntries(kinds.map((kind) => [kind, []]));
  const open = new Map();
  const close = (id) => {
    const event = open.get(id);
    if (!event) return;
    open.delete(id);
    // Each event spans exactly its frames: from half a frame before its first to half a frame after its last.
    const start = Math.max(0, (event.first - 0.5) / fps);
    const end = (event.last + 0.5) / fps;
    events[event.kind].push({
      at: event.first,
      line: `Dialogue: 0,${assTime(start)},${assTime(end)},Brand,,0,0,0,,${event.text}`,
    });
  };
  const show = (frame, kind, id, text) => {
    const event = open.get(id);
    if (event && event.text === text && event.last === frame - 1) {
      event.last = frame;
      return;
    }
    close(id);
    open.set(id, { kind, text, first: frame, last: frame });
  };

  const wordTags = (word, colour, opacity) => {
    const face = faceFor(word.italic);
    const y = word.baseline - ascentOf(face) + word.rise * em;
    const blur = (word.blur * em) / BLUR_SIGMA;
    return (
      `\\pos(${r2(word.x)},${r2(y)})\\fn${face.family}\\fs${r2(sizeOf(face))}\\i${word.italic ? 1 : 0}` +
      `\\1c${colourTag(colour)}\\alpha${alphaTag(opacity)}${blur >= 0.01 ? `\\blur${r2(blur)}` : ""}`
    );
  };

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const state = captionFrame(captionPlan, frame / fps);
    const seen = new Set();
    const put = (kind, id, text) => {
      seen.add(id);
      show(frame, kind, id, text);
    };
    if (state.panel && state.panel.opacity > 0.002) {
      const { panel } = state;
      const { look } = panel;
      const left = panel.x - panel.width / 2;
      const top = panel.y - panel.height / 2;
      const opacity = panel.opacity * look.fillOpacity;
      put(
        "panel",
        `panel:${panel.run}`,
        `{\\pos(${r2(left)},${r2(top)})\\p1\\bord0\\shad0\\1c${colourTag(look.fill)}\\alpha${alphaTag(opacity)}}${rectangle(panel.width, panel.height)}{\\p0}`,
      );
      if (look.stroke && look.strokeOpacity > 0) {
        const edge = Math.max(1, em / 30);
        put(
          "frame",
          `frame:${panel.run}`,
          `{\\pos(${r2(left)},${r2(top)})\\p1\\bord0\\shad0\\1c${colourTag(look.stroke)}\\alpha${alphaTag(panel.opacity * look.strokeOpacity)}}${frameOf(panel.width, panel.height, edge)}{\\p0}`,
        );
      }
    }
    for (const line of state.hairlines) {
      if (line.width < 0.5 || line.opacity <= 0.002) continue;
      put(
        "hairline",
        `hairline:${line.cue}`,
        `{\\pos(${r2(line.x)},${r2(line.y)})\\p1\\bord0\\shad0\\1c${colourTag(line.colour)}\\alpha${alphaTag(line.opacity)}}${rectangle(line.width, line.height)}{\\p0}`,
      );
    }
    const placed = new Map();
    for (const word of state.words) {
      placed.set(`${word.cue}:${word.index}`, word);
      if (word.opacity <= 0.002) continue;
      put(
        "word",
        `word:${word.cue}:${word.index}`,
        `{${wordTags(word, word.colour, word.opacity)}}${word.text}`,
      );
    }
    for (const light of state.lights) {
      const word = placed.get(`${light.cue}:${light.index}`);
      if (!word || light.opacity <= 0.002) continue;
      const clip = `\\clip(${r2(light.x0)},${r2(word.baseline - 1.4 * em)},${r2(light.x1)},${r2(word.baseline + 0.7 * em)})`;
      put(
        "light",
        `light:${light.cue}:${light.index}:${light.slice}`,
        `{${wordTags(word, light.colour, light.opacity)}${clip}}${word.text}`,
      );
    }
    for (const id of [...open.keys()]) if (!seen.has(id)) close(id);
  }
  for (const id of [...open.keys()]) close(id);
  return {
    styles,
    events: kinds.flatMap((kind) =>
      events[kind].sort((a, b) => a.at - b.at).map((event) => event.line),
    ),
    plan: captionPlan,
  };
}
