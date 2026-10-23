/**
 * The title card: the brand's logo arriving and settling, one pass of light
 * across it, the headline word by word (each rising into focus) over a
 * hairline that grows under it, and the tagline after. For an opening, a
 * section, or the closing card. The logo is the supplied file, never redrawn
 * (Reel 1's rule: a model may move it, nothing draws its letters).
 */
import { z } from "zod";
import { groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  logo: z.boolean().default(true),
  /** A different logo from the library (empty: the kit's). */
  logoImage: z.string().uuid().nullable().default(null),
  headline: z.string().max(90).default(""),
  tagline: z.string().max(120).default(""),
  sweep: z.boolean().default(true),
  layout: z.enum(["centre", "low"]).default("centre"),
});

export const titleTemplate = defineTemplate({
  id: "title-card",
  version: 1,
  title: "Title card",
  description:
    "The brand's logo with one pass of light across it, the headline word by word and the tagline: an opening or a closing card.",
  group: "brand",
  schema,
  fields: [
    { key: "logo", label: "Logo", kind: "toggle" },
    { key: "logoImage", label: "Another logo (empty: the kit's)", kind: "image", optional: true },
    { key: "headline", label: "Headline (empty: the brand's name)", kind: "text", max: 90 },
    { key: "tagline", label: "Tagline (empty: the kit's)", kind: "text", max: 120 },
    { key: "sweep", label: "Light across the logo", kind: "toggle" },
    { key: "layout", label: "Layout", kind: "choice", options: ["centre", "low"] },
  ],
  duration: { default: 4, min: 2, max: 20 },
  build({ params, brand, motion, width, height, u, duration, image, imageSize, fill }) {
    const portrait = height >= width;
    const logoId = params.logo ? (params.logoImage ?? brand.logoAssetId) : null;
    const known = logoId ? imageSize(logoId) : null;
    const aspect = known && known.height > 0 ? known.width / known.height : 3;
    const logoW = Math.min(
      width * (portrait ? 0.62 : 0.36),
      (portrait ? 520 : 420) * u * Math.min(2.4, aspect),
    );
    const logoH = logoW / aspect;
    const words = (fill(params.headline) || brand.name)
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeHtml);
    const tagline = escapeHtml(fill(params.tagline) || brand.tagline || "");
    const cy =
      params.layout === "low"
        ? height * (portrait ? 0.62 : 0.6)
        : height * (portrait ? 0.44 : 0.48);
    const logoTop = cy - (logoId ? logoH + 60 * u : 0) - 40 * u;
    const textTop = logoId ? cy : cy - 60 * u;
    // Into a stylesheet as well as markup: nothing in it may close the url().
    const logoUrl = logoId ? image(logoId).replace(/["\\\n]/g, "") : null;

    const logoIn: [number, number] = [0.1, Math.min(0.95, duration * 0.25)];
    const sweepAt = logoIn[1] + 0.15;
    const firstWord = logoId ? logoIn[1] - 0.1 : 0.25;
    const wordGap = Math.min(0.14, 1.2 / Math.max(1, words.length));
    const taglineAt = firstWord + words.length * wordGap + 0.25;

    const css = `
.tt-logo { position:absolute; left:${px((width - logoW) / 2)}; top:${px(logoTop)}; width:${px(logoW)}; height:${px(logoH)}; }
.tt-logo img { display:block; width:100%; height:100%; object-fit:contain; }
.tt-sweep { position:absolute; inset:0; mix-blend-mode:screen;
  ${logoUrl ? `-webkit-mask:url("${logoUrl}") center / contain no-repeat; mask:url("${logoUrl}") center / contain no-repeat;` : ""}
  background:linear-gradient(105deg, rgba(255,255,255,0) 35%, rgba(255,255,255,.75) 50%, rgba(255,255,255,0) 65%);
  background-size:300% 100%; }
.tt-head { position:absolute; left:${px(width * 0.07)}; right:${px(width * 0.07)}; top:${px(textTop)}; text-align:center;
  font-family:var(--f-display); font-size:${px((portrait ? 84 : 92) * u)}; line-height:1.08; color:var(--c-ink); }
.tt-head span { display:inline-block; }
.tt-hair { position:absolute; left:50%; top:${px(textTop + (portrait ? 230 : 140) * u)}; height:${px(3 * u)}; width:0;
  transform:translateX(-50%); background:linear-gradient(90deg, transparent, var(--c-highlight), transparent); }
.tt-tag { position:absolute; left:${px(width * 0.1)}; right:${px(width * 0.1)}; top:${px(textTop + (portrait ? 270 : 180) * u)};
  text-align:center; font-size:${px(34 * u)}; line-height:1.4; color:var(--c-muted); }
`;
    const html = [
      groundHtml(),
      logoUrl
        ? `<div class="tt-logo" id="tt-logo"><img src="${logoUrl}" alt="">${params.sweep ? `<div class="tt-sweep" id="tt-sweep"></div>` : ""}</div>`
        : "",
      `<div class="tt-head" id="tt-head">${words.map((word, k) => `<span id="tt-w-${k}">${word}</span>`).join(" ")}</div>`,
      `<div class="tt-hair" id="tt-hair"></div>`,
      tagline ? `<div class="tt-tag" id="tt-tag">${tagline}</div>` : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      if (logoUrl) {
        const p = span(t, logoIn[0], logoIn[1], motion.settle);
        st.set("#tt-logo", {
          transform: `translateY(${px((1 - p) * 40 * u)}) scale(${r3(0.92 + 0.08 * p)})`,
          filter: p >= 1 ? "none" : `blur(${px((1 - p) * 10 * u)})`,
          ...fade(p),
        });
        if (params.sweep) {
          const q = span(t, sweepAt, sweepAt + 0.9, motion.move);
          st.set("#tt-sweep", {
            "background-position": `${r3(100 - q * 100)}% 0`,
            ...fade(q > 0 && q < 1 ? 1 : 0),
          });
        }
      }
      words.forEach((_word, k) =>
        riseState(st, t, motion, u, `#tt-w-${k}`, null, firstWord + k * wordGap),
      );
      st.set("#tt-hair", {
        width: px(span(t, firstWord + 0.2, taglineAt + 0.2, motion.move) * 280 * u),
      });
      if (tagline) riseState(st, t, motion, u, "#tt-tag", null, taglineAt, { lift: 12, blur: 4 });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        ...(logoUrl ? [{ at: logoIn[1], label: "The logo settles" }] : []),
        { at: firstWord + words.length * wordGap + 0.42, label: "The headline is in" },
        ...(tagline ? [{ at: taglineAt + 0.42, label: "The tagline is in" }] : []),
      ],
    };
  },
});
