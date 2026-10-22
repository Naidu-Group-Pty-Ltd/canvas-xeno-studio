/**
 * G-PAGES, the pages running past: a run of pages (a report's, a product's
 * screens) passing the camera in depth, each coming in from the right and
 * from behind, held a moment square to the camera, then carried away to the
 * left. Reel 1 ran the client's report past the camera this way (08.2).
 */
import { z } from "zod";
import { groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, lerp, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  pages: z.array(z.string().uuid()).max(8).default([]),
  /** A label a page, in order (optional). */
  labels: z.array(z.string().max(60)).max(8).default([]),
  eyebrow: z.string().max(60).default(""),
  /** The pages' shape when the library doesn't know it: width over height. */
  shape: z.enum(["portrait", "landscape", "square"]).default("portrait"),
});

export const pagesTemplate = defineTemplate({
  id: "pages-running-past",
  version: 1,
  title: "Pages running past",
  description:
    "A run of pages passes the camera in depth: each comes in from behind, is held square to the camera, then carried away.",
  group: "kit",
  schema,
  fields: [
    {
      key: "pages",
      label: "Pages",
      kind: "images",
      max: 8,
      help: "Report pages or screens, in order",
    },
    { key: "labels", label: "Labels (one a page)", kind: "lines", max: 8 },
    { key: "eyebrow", label: "Eyebrow", kind: "text", max: 60 },
    {
      key: "shape",
      label: "Page shape",
      kind: "choice",
      options: ["portrait", "landscape", "square"],
    },
  ],
  duration: { default: 6, min: 2, max: 30 },
  build({ params, motion, width, height, u, duration, image, imageSize, fill }) {
    const portrait = height >= width;
    const pages = params.pages.length ? params.pages : [null, null, null];
    const n = pages.length;
    const fallback =
      params.shape === "landscape" ? 1.414 : params.shape === "square" ? 1 : 1 / 1.414;
    const box = { w: width * (portrait ? 0.72 : 0.42), h: height * (portrait ? 0.56 : 0.72) };
    const sizeOf = (assetId: string | null) => {
      const known = assetId ? imageSize(assetId) : null;
      const aspect = known && known.height > 0 ? known.width / known.height : fallback;
      const w = Math.min(box.w, box.h * aspect);
      return { w, h: w / aspect };
    };
    const cy = portrait ? height * 0.46 : height * 0.5;
    const eyebrow = escapeHtml(fill(params.eyebrow));
    const labels = params.labels.map((label) => escapeHtml(fill(label)));

    // Each page has its slot of the time: in, held, out, overlapping its neighbours a little.
    const lead = 0.2;
    const slot = Math.max(0.6, (duration - lead - 0.4) / n);
    const travel = Math.min(0.75, slot * 0.45);
    const centreAt = (k: number) => lead + slot * k + slot * 0.4;

    const css = `
.pg-stage { position:absolute; inset:0; perspective:${px(2200 * u)}; perspective-origin:50% ${px(cy)}; }
.pg-page { position:absolute; left:50%; top:${px(cy)}; transform-origin:50% 50%; border-radius:${px(10 * u)}; overflow:hidden;
  background:#fbfbf8; box-shadow:0 ${px(40 * u)} ${px(100 * u)} rgba(0,0,0,.5); backface-visibility:hidden; }
.pg-page img { display:block; width:100%; height:100%; object-fit:cover; }
.pg-page .cx-placeholder { color:#6b7280; background:#f3f4f6; }
.pg-label { position:absolute; left:${px(width * 0.1)}; right:${px(width * 0.1)}; top:${px(cy + box.h / 2 + 50 * u)};
  text-align:center; font-family:var(--f-display); font-size:${px(42 * u)}; color:var(--c-ink); }
.pg-eyebrow { position:absolute; left:0; right:0; top:${px(cy - box.h / 2 - 110 * u)}; text-align:center; }
`;
    const html = [
      groundHtml(),
      eyebrow
        ? `<div class="pg-eyebrow"><span class="cx-eyebrow" id="pg-eyebrow">${eyebrow}</span></div>`
        : "",
      `<div class="pg-stage">`,
      pages
        .map((assetId, k) => {
          const { w, h } = sizeOf(assetId);
          return `<div class="pg-page" id="pg-${k}" style="width:${px(w)};height:${px(h)};margin-left:${px(-w / 2)};margin-top:${px(-h / 2)};visibility:hidden">${
            assetId
              ? `<img src="${image(assetId)}" alt="">`
              : `<div class="cx-placeholder">Page ${k + 1}</div>`
          }</div>`;
        })
        .join(""),
      `</div>`,
      labels
        .map((label, k) => (label ? `<div class="pg-label" id="pg-label-${k}">${label}</div>` : ""))
        .join(""),
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      if (eyebrow) riseState(st, t, motion, u, "#pg-eyebrow", null, 0.1);
      pages.forEach((_page, k) => {
        const at = centreAt(k);
        // In from the right and behind, on the move curve; out to the left once its slot is over.
        const inP = span(t, at - travel, at, motion.move);
        const outP = k === n - 1 ? 0 : span(t, at + slot - travel, at + slot, motion.move);
        const x = lerp(width * 0.75, 0, inP) - width * 0.75 * outP;
        const z = lerp(-900, 0, inP) - 900 * outP;
        const turn = lerp(-38, 0, inP) + 38 * outP;
        const shown = Math.min(
          span(t, at - travel, at - travel + 0.2, motion.linear),
          1 - span(t, at + slot - 0.2, at + slot, motion.linear) * (k === n - 1 ? 0 : 1),
        );
        st.set(`#pg-${k}`, {
          transform: `translate3d(${px(x)}, 0, ${px(z * u)}) rotateY(${r3(turn)}deg)`,
          "z-index": String(10 + k),
          ...fade(shown),
        });
        if (labels[k]) {
          const label = Math.min(
            span(t, at - 0.1, at + 0.25, motion.settle),
            1 -
              (k === n - 1
                ? 0
                : span(t, at + slot - travel, at + slot - travel + 0.2, motion.linear)),
          );
          st.set(`#pg-label-${k}`, {
            transform: `translateY(${px((1 - label) * 16 * u)})`,
            ...fade(label),
          });
        }
      });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: pages.map((_page, k) => ({
        at: centreAt(k),
        label: labels[k] || `Page ${k + 1} held`,
      })),
    };
  },
});
