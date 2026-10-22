/**
 * G-CTA, the call to action, alive: the brand's call to action on a button
 * whose gradient runs once a bar, whose halo breathes on the music's beats
 * and across which light passes once a bar; the pointer comes to it, it lifts
 * toward it, and the press sinks it, flashes from where it was pressed and
 * throws the focus ring (after Reel 1's pages/cta.cjs, on Aurixa's prismatic
 * button). Every part is set frame by frame, so it holds at any frame.
 */
import { z } from "zod";
import { groundHtml, pointerHtml, pointerState, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, rgba, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  label: z.string().max(40).default(""),
  sublabel: z.string().max(60).default(""),
  headline: z.string().max(90).default(""),
  /** The music's tempo, for the halo's beat and the gradient's bar. */
  bpm: z.number().min(60).max(200).default(120),
  /** Where the first beat falls, in seconds from the start. */
  beatOffset: z.number().min(0).max(4).default(0),
  pointer: z.boolean().default(true),
  press: z.boolean().default(true),
});

const ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

export const ctaTemplate = defineTemplate({
  id: "call-to-action",
  version: 1,
  title: "Call to action",
  description:
    "The brand's call to action on a living button: its light runs on the music's bars and beats, and the pointer presses it.",
  group: "kit",
  schema,
  fields: [
    { key: "label", label: "Button (empty: the kit's call to action)", kind: "text", max: 40 },
    {
      key: "sublabel",
      label: "Under the button (empty: the kit's website)",
      kind: "text",
      max: 60,
    },
    { key: "headline", label: "Headline", kind: "text", max: 90 },
    { key: "bpm", label: "Music tempo (BPM)", kind: "number", min: 60, max: 200, step: 0.01 },
    { key: "beatOffset", label: "First beat at (s)", kind: "number", min: 0, max: 4, step: 0.01 },
    { key: "pointer", label: "Pointer", kind: "toggle" },
    { key: "press", label: "Press", kind: "toggle" },
  ],
  duration: { default: 4, min: 2, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const label = escapeHtml(
      (fill(params.label) || brand.callToAction || "Get started").toUpperCase(),
    );
    const sublabel = escapeHtml(fill(params.sublabel) || brand.website || "");
    const headline = escapeHtml(fill(params.headline));
    const beat = 60 / params.bpm;
    const bar = 4 * beat;
    const bw = Math.min(width * (portrait ? 0.78 : 0.42), 860 * u);
    const bh = 132 * u;
    const cx = width / 2;
    const cy = portrait ? height * 0.5 : height * 0.56;
    const c = brand.colours;

    const rise = Math.min(0.55, duration * 0.15);
    const pressAt = Math.max(rise + 1, duration - 1.3);
    const approach = pressAt - Math.min(1.1, pressAt - rise - 0.1);
    const tip: [number, number] = [cx + bw * 0.18, cy + bh * 0.12];

    const css = `
.ct-text { position:absolute; left:${px(width * 0.08)}; right:${px(width * 0.08)}; top:${px(cy - bh / 2 - 330 * u)}; text-align:center; }
.ct-btn { position:absolute; left:${px(cx - bw / 2)}; top:${px(cy - bh / 2)}; width:${px(bw)}; height:${px(bh)}; transform-origin:50% 50%; }
.ct-halo { position:absolute; left:${px(-120 * u)}; right:${px(-120 * u)}; top:${px(-90 * u)}; bottom:${px(-90 * u)}; border-radius:50%;
  background:radial-gradient(closest-side, ${rgba(c.highlight, 0.55)}, ${rgba(c.highlight, 0.2)} 45%, ${rgba(c.accent, 0.1)} 70%, transparent 100%); }
.ct-body { position:absolute; inset:0; border-radius:${px(16 * u)}; overflow:hidden; border:1px solid ${rgba(c.highlight, 0.85)};
  box-shadow:0 ${px(18 * u)} ${px(40 * u)} rgba(0,0,0,.55), 0 0 ${px(30 * u)} ${rgba(c.highlight, 0.3)}; }
.ct-grad { position:absolute; inset:0; background:linear-gradient(-45deg, ${c.ground} 0%, ${c.highlight} 25%, ${c.accent} 50%, ${c.ground} 75%, ${c.highlight} 100%);
  background-size:300% 300%; }
.ct-depth { position:absolute; inset:0; background:linear-gradient(180deg, rgba(255,255,255,.2) 0%, rgba(255,255,255,.05) 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,.25) 100%); }
.ct-sheen { position:absolute; top:-20%; bottom:-20%; width:46%; left:0; mix-blend-mode:screen; transform:skewX(-18deg);
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.32) 50%, rgba(255,255,255,0)); }
.ct-flash { position:absolute; inset:0; mix-blend-mode:screen; }
.ct-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:${px(24 * u)};
  color:#fff; font-family:var(--f-body); font-weight:800; font-size:${px(34 * u)}; letter-spacing:.22em; white-space:nowrap;
  text-shadow:0 2px 4px rgba(0,0,0,.55); }
.ct-label svg { width:${px(36 * u)}; height:${px(36 * u)}; stroke:#fff; stroke-width:2.2; fill:none; stroke-linecap:round; stroke-linejoin:round; }
.ct-ring { position:absolute; left:${px(-10 * u)}; right:${px(-10 * u)}; top:${px(-10 * u)}; bottom:${px(-10 * u)}; border-radius:${px(22 * u)};
  border:${px(3 * u)} solid var(--c-accent); box-shadow:0 0 ${px(18 * u)} ${rgba(c.accent, 0.55)}; }
.ct-sub { position:absolute; left:0; right:0; top:${px(cy + bh / 2 + 56 * u)}; text-align:center; font-size:${px(30 * u)}; color:var(--c-muted); letter-spacing:.04em; }
`;
    const html = [
      groundHtml(),
      headline
        ? `<div class="ct-text"><div class="cx-headline" id="ct-headline">${headline}</div></div>`
        : "",
      `<div class="ct-btn" id="ct-btn"><div class="ct-halo" id="ct-halo"></div><div class="ct-body">`,
      `<div class="ct-grad" id="ct-grad"></div><div class="ct-depth"></div><div class="ct-sheen" id="ct-sheen"></div><div class="ct-flash" id="ct-flash"></div>`,
      `<div class="ct-label"><span>${label}</span><svg viewBox="0 0 24 24">${ARROW}</svg></div></div>`,
      `<div class="ct-ring" id="ct-ring" style="visibility:hidden"></div></div>`,
      sublabel ? `<div class="ct-sub" id="ct-sub">${sublabel}</div>` : "",
      params.pointer ? pointerHtml() : "",
    ].join("");

    /** The last beat at or before t, and whether it opens a bar. */
    const lastBeat = (t: number) => {
      const n = Math.floor((t - params.beatOffset) / beat + 1e-6);
      return { at: params.beatOffset + n * beat, downbeat: ((n % 4) + 4) % 4 === 0 };
    };

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, 0, rise, motion.settle);
      if (headline) riseState(st, t, motion, u, "#ct-headline", null, 0.05);
      // Lifting toward the pointer as it comes, sinking under the press.
      const near = params.pointer ? span(t, approach + 0.3, pressAt - 0.1, motion.settle) : 0;
      const sinceP = params.press ? t - pressAt : -1;
      const sink = sinceP >= 0 && sinceP < 0.24 ? Math.sin((Math.PI * sinceP) / 0.24) : 0;
      st.set("#ct-btn", {
        transform: `translateY(${px((1 - up) * 50 * u - near * 6 * u)}) scale(${r3((0.94 + 0.06 * up) * (1 + 0.02 * near) * (1 - 0.035 * sink))})`,
        ...fade(up),
      });
      // The gradient runs once a bar, quicker under the pointer.
      const phase = ((t / bar) * (1 + 0.5 * near)) % 1;
      st.set("#ct-grad", { "background-position": `${r3(phase * 100)}% 50%` });
      const pulse =
        t >= params.beatOffset
          ? Math.exp(-(t - lastBeat(t).at) / 0.26) * (lastBeat(t).downbeat ? 1 : 0.55)
          : 0;
      st.set("#ct-halo", {
        opacity: r3(Math.min(1, up * (0.45 + 0.4 * pulse + 0.25 * near))),
        transform: `scale(${r3(1 + 0.05 * pulse)})`,
      });
      // Light passes once a bar, on its downbeat.
      const sinceBar = (((t - params.beatOffset) % bar) + bar) % bar;
      const sweep = sinceBar < 0.7 ? sinceBar / 0.7 : 1;
      st.set("#ct-sheen", {
        transform: `translateX(${px(-0.5 * bw + sweep * 1.6 * bw)}) skewX(-18deg)`,
        ...fade(sweep < 1 ? up * 0.9 : 0),
      });
      const flash = sinceP >= 0 ? Math.exp(-sinceP / 0.18) : 0;
      st.set("#ct-flash", {
        background: `radial-gradient(circle at ${r3(((tip[0] - (cx - bw / 2)) / bw) * 100)}% ${r3(((tip[1] - (cy - bh / 2)) / bh) * 100)}%, rgba(255,255,255,${r3(0.7 * flash)}), rgba(255,255,255,0) 60%)`,
      });
      const ring =
        sinceP >= 0 ? span(t, pressAt, pressAt + motion.pressSeconds * 1.6, motion.settle) : 0;
      st.set("#ct-ring", {
        transform: `scale(${r3(0.98 + 0.06 * ring)})`,
        ...fade(ring > 0 ? 1 - ring * 0.6 : 0),
      });
      if (sublabel) st.set("#ct-sub", fade(span(t, rise, rise + 0.4, motion.linear)));
      if (params.pointer)
        pointerState(st, t, motion, u, {
          from: [width * 0.88, height * (portrait ? 0.82 : 0.9)],
          to: tip,
          a: approach,
          b: pressAt - 0.08,
          show: approach,
          press: params.press ? pressAt : null,
        });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rise, label: "The button is in" },
        ...(params.press ? [{ at: pressAt, label: "Pressed" }] : []),
      ],
    };
  },
});
