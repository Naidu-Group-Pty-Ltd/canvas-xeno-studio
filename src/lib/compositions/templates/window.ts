/**
 * G-WINDOW with G-POINTER and G-FOCUS: a screen of the product in the brand's
 * glass window. The window rises in; the camera pushes in on the part that
 * matters; the pointer travels there on the brand's move curve and presses
 * (the press ring grows and fades over the brand's press time); the focus
 * corners close on the result, which is held. One action, then its result
 * held at least 0.8 s before anything else moves (Reel 1's brief).
 */
import { z } from "zod";
import {
  cornersHtml,
  cornersState,
  demoLabelHtml,
  groundHtml,
  pointerHtml,
  pointerState,
  riseState,
} from "../kit";
import { CompositionState, escapeHtml, fade, lerp, px, r3, span, zoomLerp } from "../state";
import { defineTemplate } from "../types";

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

const schema = z.object({
  image: z.string().uuid().nullable().default(null),
  address: z.string().max(80).default(""),
  eyebrow: z.string().max(60).default(""),
  headline: z.string().max(90).default(""),
  zoom: z.number().min(1).max(3).default(1.7),
  focus: point.default({ x: 0.5, y: 0.4 }),
  pointer: z.boolean().default(true),
  target: point.default({ x: 0.6, y: 0.45 }),
  press: z.boolean().default(true),
  highlight: z.boolean().default(true),
  highlightWidth: z.number().min(0.05).max(1).default(0.32),
  highlightHeight: z.number().min(0.03).max(1).default(0.1),
  demoLabel: z.boolean().default(true),
});

export const windowTemplate = defineTemplate({
  id: "product-window",
  version: 1,
  title: "Product window",
  description:
    "A screen of the product in the brand's glass window: the camera pushes in, the pointer presses, and the result is held in focus corners.",
  group: "kit",
  schema,
  fields: [
    { key: "image", label: "Screen", kind: "image", help: "A screenshot or plate of the product" },
    { key: "address", label: "Window address", kind: "text", max: 80 },
    { key: "eyebrow", label: "Eyebrow", kind: "text", max: 60 },
    { key: "headline", label: "Headline", kind: "text", max: 90 },
    { key: "zoom", label: "Push in to", kind: "number", min: 1, max: 3, step: 0.1 },
    { key: "focus", label: "Push in on", kind: "point" },
    { key: "pointer", label: "Pointer", kind: "toggle" },
    { key: "target", label: "Pointer goes to", kind: "point" },
    { key: "press", label: "Press", kind: "toggle" },
    { key: "highlight", label: "Focus corners", kind: "toggle" },
    {
      key: "highlightWidth",
      label: "Corners width",
      kind: "number",
      min: 0.05,
      max: 1,
      step: 0.01,
    },
    {
      key: "highlightHeight",
      label: "Corners height",
      kind: "number",
      min: 0.03,
      max: 1,
      step: 0.01,
    },
    { key: "demoLabel", label: "Demo workspace label", kind: "toggle" },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, brand, motion, width, height, u, duration, image, imageSize, fill }) {
    const portrait = height >= width;
    const size = params.image ? imageSize(params.image) : null;
    const aspect = size && size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 10;
    // The window fits the screen's own shape inside the action zone.
    const bar = 58 * u;
    const maxW = width * (portrait ? 0.88 : 0.62);
    const maxH = height * (portrait ? 0.46 : 0.66) - bar;
    const pw = Math.min(maxW, maxH * aspect);
    const ph = pw / aspect;
    const cx = width / 2;
    const cy = portrait ? height * 0.45 : height * 0.54;
    const win = { x: cx - pw / 2, y: cy - (ph + bar) / 2, w: pw, h: ph + bar };
    const address = escapeHtml(fill(params.address) || brand.website || brand.name);
    const eyebrow = escapeHtml(fill(params.eyebrow));
    const headline = escapeHtml(fill(params.headline));
    const textTop = Math.max(40 * u, win.y - (headline ? 210 : 120) * u);

    // When things happen, scaled to the length but never rushed.
    const rise: [number, number] = [0, Math.min(0.6, duration * 0.15)];
    const pushStart = rise[1] + 0.15;
    const pushEnd = pushStart + Math.min(1.6, duration * 0.3);
    const press = Math.min(duration - 1.6, pushEnd + Math.max(0.9, duration * 0.22));
    const pointerIn = Math.max(pushEnd - 0.5, rise[1]);
    const cornersAt = press + 0.08;

    const camera = (t: number) => {
      const p = span(t, pushStart, pushEnd, motion.move);
      const zoom = zoomLerp(1, params.zoom, p);
      const fx = lerp(0.5, params.focus.x, p);
      const fy = lerp(0.5, params.focus.y, p);
      const iw = pw * zoom;
      const ih = ph * zoom;
      // The point in focus to the page's centre, never showing past the screen's edge.
      const ox = Math.min(0, Math.max(pw - iw, pw / 2 - fx * iw));
      const oy = Math.min(0, Math.max(ph - ih, ph / 2 - fy * ih));
      return { zoom, ox, oy, map: (x: number, y: number) => [ox + x * iw, oy + y * ih] as const };
    };
    // Where the pointer goes, on the frame, once the camera has settled.
    const settled = camera(pushEnd);
    const [tx, ty] = settled.map(params.target.x, params.target.y);
    const target: [number, number] = [win.x + tx, win.y + bar + ty];
    const from: [number, number] = [
      width * (portrait ? 0.86 : 0.8),
      height * (portrait ? 0.78 : 0.86),
    ];
    const hw = params.highlightWidth * pw * params.zoom;
    const hh = params.highlightHeight * ph * params.zoom;
    const rect: [number, number, number, number] = [
      Math.max(win.x, target[0] - hw / 2),
      Math.max(win.y + bar, target[1] - hh / 2),
      Math.min(hw, win.w),
      Math.min(hh, ph),
    ];

    const css = `
.pw-win { left:${px(win.x)}; top:${px(win.y)}; width:${px(win.w)}; height:${px(win.h)}; transform-origin:50% 60%; }
.pw-page { position:absolute; left:0; top:${px(bar)}; width:${px(pw)}; height:${px(ph)}; overflow:hidden; background:var(--c-surface); }
.pw-img { position:absolute; left:0; top:0; width:${px(pw)}; height:${px(ph)}; transform-origin:0 0; object-fit:cover; }
.pw-text { position:absolute; left:${px(width * 0.08)}; right:${px(width * 0.08)}; top:${px(textTop)}; text-align:center; }
.pw-text .cx-eyebrow { display:block; margin-bottom:${px(18 * u)}; }
`;
    const html = [
      groundHtml(),
      eyebrow || headline
        ? `<div class="pw-text">${eyebrow ? `<span class="cx-eyebrow" id="pw-eyebrow">${eyebrow}</span>` : ""}${
            headline ? `<div class="cx-headline" id="pw-headline">${headline}</div>` : ""
          }</div>`
        : "",
      `<div class="cx-glass pw-win" id="pw-win"><div class="cx-bar"><i></i><i></i><i></i><span>${address}</span></div>`,
      `<div class="pw-page">${
        params.image
          ? `<img class="pw-img" id="pw-img" src="${image(params.image)}" alt="">`
          : `<div class="cx-placeholder" id="pw-img">Choose a screen of the product</div>`
      }</div></div>`,
      params.demoLabel
        ? demoLabelHtml(escapeHtml(brand.demo.label), {
            left: win.x + 24 * u,
            top: win.y + win.h + 22 * u,
          })
        : "",
      params.highlight ? cornersHtml() : "",
      params.pointer ? pointerHtml() : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, rise[0], rise[1], motion.settle);
      st.set("#pw-win", {
        transform: `translateY(${px((1 - up) * 90 * u)}) scale(${r3(0.96 + 0.04 * up)})`,
        ...fade(up),
      });
      if (eyebrow) riseState(st, t, motion, u, "#pw-eyebrow", null, rise[0] + 0.1);
      if (headline) riseState(st, t, motion, u, "#pw-headline", null, rise[0] + 0.22);
      if (params.demoLabel)
        st.set("#cx-demo", fade(span(t, rise[1], rise[1] + 0.3, motion.linear)));
      const cam = camera(t);
      if (params.image)
        st.set("#pw-img", {
          transform: `translate(${px(cam.ox)}, ${px(cam.oy)}) scale(${cam.zoom.toFixed(5)})`,
        });
      if (params.pointer)
        pointerState(st, t, motion, u, {
          from,
          to: target,
          a: pointerIn,
          b: press - 0.12,
          show: pointerIn,
          press: params.press ? press : null,
        });
      if (params.highlight) cornersState(st, t, motion, u, rect, cornersAt, cornersAt + 0.45);
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rise[1], label: "The window is in" },
        { at: pushEnd, label: "Pushed in" },
        ...(params.pointer && params.press ? [{ at: press, label: "Press" }] : []),
        ...(params.highlight ? [{ at: cornersAt + 0.45, label: "Result held" }] : []),
      ],
    };
  },
});
