/**
 * The cover: a stage (a picture behind everything, such as a lit floor made
 * by a model with no text in it), the headline in the brand's display type
 * with its last word in the accent italic over a hairline, the logo, the call
 * to action on its button, and the product's own screens leaning in depth: the
 * main one large, the rest in a row beneath it. Drawn as a still it is a
 * thumbnail or a cover (`draw_still`); played, everything rises in once.
 *
 * After the Briefing Room thumbnails (Oct 2026), which were made this way
 * beside the studio: every letter is set by the page in the brand's own
 * fonts, every screen is the product's, the logo is the supplied file, and a
 * model is asked for light only. Side by side for a landscape frame, the
 * words above the screens for a portrait one.
 */
import { z } from "zod";
import { groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, mix, px, r3, rgba, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  layout: z.enum(["auto", "side by side", "stacked"]).default("auto"),
  /** The stage: a library picture behind everything (empty: the brand's ground). */
  stage: z.string().uuid().nullable().default(null),
  /** How much the stage is darkened behind the words, 0 to 0.8. */
  shade: z.number().min(0).max(0.8).default(0.35),
  logo: z.boolean().default(true),
  /** A different logo from the library (empty: the kit's). */
  logoImage: z.string().uuid().nullable().default(null),
  eyebrow: z.string().max(60).default(""),
  headline: z.string().max(120).default(""),
  /** The headline's last word in the accent italic, with the hairline under it. */
  accent: z.boolean().default(true),
  button: z.boolean().default(true),
  /** The call to action (empty: the kit's). */
  cta: z.string().max(40).default(""),
  /** The product's screens: the first large, the rest in a row beneath it. */
  screens: z.array(z.string().uuid()).max(6).default([]),
  /** How far the screens lean, in degrees. */
  tilt: z.number().min(0).max(30).default(12),
  reflection: z.boolean().default(true),
});

export const coverTemplate = defineTemplate({
  id: "cover",
  version: 1,
  title: "Cover",
  description:
    "A thumbnail or cover, drawn as a still: a stage behind everything, the headline in the brand's type with its last word in the accent, the logo, the call to action and the product's own screens leaning in depth. Played, everything rises in once.",
  group: "brand",
  schema,
  fields: [
    {
      key: "layout",
      label: "Layout",
      kind: "choice",
      options: ["auto", "side by side", "stacked"],
      help: "auto: side by side in a landscape frame, the words above the screens in a portrait one",
    },
    {
      key: "stage",
      label: "Stage (empty: the brand's ground)",
      kind: "image",
      optional: true,
      help: "A picture behind everything: light, haze and a floor, with no text, screens or people in it",
    },
    { key: "shade", label: "Shade behind the words", kind: "number", min: 0, max: 0.8, step: 0.05 },
    { key: "logo", label: "Logo", kind: "toggle" },
    { key: "logoImage", label: "Another logo (empty: the kit's)", kind: "image", optional: true },
    { key: "eyebrow", label: "Eyebrow (a short line above the headline)", kind: "text", max: 60 },
    {
      key: "headline",
      label: "Headline (empty: the kit's tagline, else its name)",
      kind: "longtext",
      max: 120,
    },
    { key: "accent", label: "Last word in the accent italic", kind: "toggle" },
    { key: "button", label: "Call to action", kind: "toggle" },
    { key: "cta", label: "Its words (empty: the kit's)", kind: "text", max: 40 },
    {
      key: "screens",
      label: "Screens",
      kind: "images",
      max: 6,
      help: "The product's own pages: the first large, the rest in a row beneath it",
    },
    { key: "tilt", label: "Lean (degrees)", kind: "number", min: 0, max: 30, step: 1 },
    { key: "reflection", label: "Reflected in the floor", kind: "toggle" },
  ],
  duration: { default: 3, min: 0.5, max: 10 },
  build({ params, brand, motion, width, height, u, duration, image, imageSize, fill }) {
    const c = brand.colours;
    const stacked =
      params.layout === "stacked" || (params.layout === "auto" && height > width * 1.05);
    const url = (id: string) => image(id).replace(/["\\\n]/g, "");

    // The words.
    const headline = fill(params.headline).trim() || brand.tagline?.trim() || brand.name;
    const words = headline.split(/\s+/).filter(Boolean);
    const lastWord = params.accent && words.length > 1 ? words.pop()! : null;
    const headlineHtml = [
      escapeHtml(words.join(" ")),
      lastWord ? `<em class="cv-accent">${escapeHtml(lastWord)}</em>` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const letters = headline.length;
    const headSize =
      (stacked ? 1 : 1.06) *
      (letters <= 40 ? 92 : letters <= 64 ? 80 : letters <= 90 ? 68 : 58) *
      u;
    const eyebrow = escapeHtml(fill(params.eyebrow).trim());
    const cta = params.button
      ? escapeHtml(fill(params.cta).trim() || brand.callToAction || "")
      : "";
    const logoId = params.logo ? (params.logoImage ?? brand.logoAssetId) : null;
    const logoSize = logoId ? imageSize(logoId) : null;
    const logoAspect = logoSize && logoSize.height > 0 ? logoSize.width / logoSize.height : 3;

    // Where things go: the words' column and the screens' stage.
    const margin = (stacked ? 0.07 : 0.06) * width;
    const column = stacked
      ? { left: margin, top: height * 0.06, width: width - margin * 2 }
      : { left: margin, top: height * 0.17, width: width * 0.4 };
    const logoH = (stacked ? 74 : 64) * u;
    const logoW = Math.min(column.width * 0.6, logoH * logoAspect);
    const screens = params.screens;
    const hero = screens[0] ?? null;
    const row = screens.slice(1);
    const heroBox = stacked
      ? { left: width * 0.08, top: height * 0.42, width: width * 0.84 }
      : { left: width * 0.5, top: height * 0.12, width: width * 0.45 };
    const heroSize = hero ? imageSize(hero) : null;
    const heroAspect = heroSize && heroSize.width > 0 ? heroSize.height / heroSize.width : 0.62;
    const heroH = heroBox.width * Math.min(1.2, heroAspect);
    const floor = stacked ? heroBox.top + heroH + 40 * u : heroBox.top + heroH + 48 * u;
    const rowGap = 18 * u;
    const rowWidth =
      (stacked ? width * 0.84 : heroBox.width * 1.04) - rowGap * Math.max(0, row.length - 1);
    const tileW = row.length ? Math.min(rowWidth / row.length, (stacked ? 230 : 250) * u) : 0;
    const rowLeft =
      (stacked ? width / 2 : heroBox.left + heroBox.width / 2) -
      (tileW * row.length + rowGap * Math.max(0, row.length - 1)) / 2;
    const tileH = tileW * 0.66;
    const lean = stacked ? params.tilt * 0.6 : params.tilt;
    const reflect = params.reflection
      ? "-webkit-box-reflect:below calc(var(--u) * 6) linear-gradient(transparent 62%, rgba(255,255,255,.16));"
      : "";

    const css = `
.cv-stage { position:absolute; inset:0; background-size:cover; background-position:center; }
.cv-shade { position:absolute; inset:0; background:${
      stacked
        ? `linear-gradient(180deg, ${rgba(c.ground, params.shade)} 0%, ${rgba(c.ground, params.shade * 0.5)} 38%, transparent 60%)`
        : `linear-gradient(90deg, ${rgba(c.ground, params.shade)} 0%, ${rgba(c.ground, params.shade * 0.6)} 38%, transparent 62%)`
    }; }
.cv-words { position:absolute; left:${px(column.left)}; top:${px(column.top)}; width:${px(column.width)};
  ${stacked ? "text-align:center;" : ""} }
.cv-logo { display:block; width:${px(logoW)}; height:${px(logoH)}; object-fit:contain;
  margin:0 ${stacked ? "auto" : "0"} ${px(36 * u)}; }
.cv-eyebrow { margin-bottom:${px(18 * u)}; }
.cv-head { font-family:var(--f-display); font-size:${px(headSize)}; line-height:1.06; font-weight:500;
  letter-spacing:-0.01em; color:var(--c-ink);
  background-image:linear-gradient(180deg, ${c.ink} 0%, ${mix(c.ink, c.muted, 0.55)} 100%);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.cv-accent { font-style:italic; font-weight:400; background-image:linear-gradient(180deg, ${mix(c.highlight, "#ffffff", 0.35)}, ${c.highlight});
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; padding-right:0.06em; }
.cv-hair { height:${px(3 * u)}; width:0; margin:${px(26 * u)} ${stacked ? "auto" : "0"} 0;
  background:linear-gradient(90deg, ${stacked ? "transparent, " : ""}${c.highlight}, ${rgba(c.highlight, 0)}); }
.cv-cta { display:inline-flex; align-items:center; gap:${px(18 * u)}; margin-top:${px((stacked ? 34 : 48) * u)};
  padding:${px(22 * u)} ${px(42 * u)}; border-radius:${px(10 * u)};
  font-family:var(--f-body); font-size:${px(30 * u)}; font-weight:700; letter-spacing:.22em; text-transform:uppercase;
  color:${mix(c.ground, "#000000", 0.3)};
  background:linear-gradient(90deg, ${mix(c.accent, c.highlight, 0.15)}, ${c.highlight});
  border:${px(1.5 * u)} solid ${mix(c.highlight, "#ffffff", 0.45)};
  box-shadow:0 0 ${px(40 * u)} ${rgba(c.highlight, 0.45)}, 0 ${px(18 * u)} ${px(40 * u)} rgba(0,0,0,.4); }
.cv-cta i { font-style:normal; font-weight:400; opacity:.75; }
.cv-depth { position:absolute; inset:0; perspective:${px(2600 * u)}; perspective-origin:${stacked ? "50% 40%" : "70% 40%"}; }
.cv-hero { position:absolute; left:${px(heroBox.left)}; top:${px(heroBox.top)}; width:${px(heroBox.width)}; height:${px(heroH)};
  transform-origin:${stacked ? "50% 50%" : "100% 50%"}; ${reflect} }
.cv-hero img, .cv-tile img { display:block; width:100%; height:100%; object-fit:cover; object-position:top center; }
.cv-tile { position:absolute; top:${px(floor)}; width:${px(tileW)}; height:${px(tileH)}; border-radius:${px(14 * u)}; ${reflect} }
.cv-floorline { position:absolute; left:0; right:0; top:${px(floor + tileH + 2 * u)}; height:${px(2 * u)};
  background:linear-gradient(90deg, transparent, ${rgba(c.highlight, 0.7)} 50%, transparent); }
`;
    const html = [
      params.stage
        ? `<div class="cv-stage" id="cv-stage" style="background-image:url(&quot;${url(params.stage)}&quot;)"></div>`
        : groundHtml(),
      params.shade > 0 ? `<div class="cv-shade"></div>` : "",
      `<div class="cv-depth">`,
      hero
        ? `<div class="cx-glass cv-hero" id="cv-hero"><img src="${url(hero)}" alt=""></div>`
        : "",
      row
        .map(
          (id, k) =>
            `<div class="cx-glass cv-tile" id="cv-tile-${k}" style="left:${px(rowLeft + k * (tileW + rowGap))}"><img src="${url(id)}" alt=""></div>`,
        )
        .join(""),
      `</div>`,
      row.length && params.reflection ? `<div class="cv-floorline" id="cv-floor"></div>` : "",
      `<div class="cv-words">`,
      logoId ? `<img class="cv-logo" id="cv-logo" src="${url(logoId)}" alt="">` : "",
      eyebrow ? `<div class="cx-eyebrow cv-eyebrow" id="cv-eyebrow">${eyebrow}</div>` : "",
      `<div class="cv-head" id="cv-head">${headlineHtml}</div>`,
      lastWord ? `<div class="cv-hair" id="cv-hair"></div>` : "",
      cta ? `<div class="cv-cta" id="cv-cta">${cta} <i>›</i></div>` : "",
      `</div>`,
    ].join("");

    // Everything rises in once over the first part of the composition, then holds.
    const lead = Math.min(1.6, duration * 0.55);
    const at = (share: number) => share * lead;
    const state = (t: number) => {
      const st = new CompositionState();
      if (params.stage) {
        const p = span(t, 0, at(0.5), motion.settle);
        st.set("#cv-stage", { transform: `scale(${r3(1.04 - 0.04 * p)})`, ...fade(p) });
      }
      if (hero) {
        const p = span(t, at(0.15), at(0.85), motion.settle);
        st.set("#cv-hero", {
          transform: `translateX(${px((1 - p) * (stacked ? 0 : 60) * u)}) translateY(${px((1 - p) * (stacked ? 60 : 0) * u)}) rotateY(${r3(-lean * (stacked ? 0 : 1))}deg) rotateX(${r3(stacked ? lean * 0.5 : 2)}deg)`,
          ...fade(p),
        });
      }
      row.forEach((_id, k) => {
        const p = span(t, at(0.4 + k * 0.07), at(0.9 + k * 0.05), motion.settle);
        st.set(`#cv-tile-${k}`, {
          transform: `translateY(${px((1 - p) * 40 * u)}) rotateX(${r3(lean * 0.6)}deg)`,
          ...fade(p),
        });
      });
      if (row.length && params.reflection)
        st.set("#cv-floor", fade(span(t, at(0.6), at(1), motion.move)));
      if (logoId) riseState(st, t, motion, u, "#cv-logo", null, at(0.05), { seconds: at(0.4) });
      if (eyebrow) riseState(st, t, motion, u, "#cv-eyebrow", null, at(0.12), { seconds: at(0.4) });
      riseState(st, t, motion, u, "#cv-head", null, at(0.2), { seconds: at(0.45) });
      if (lastWord)
        st.set("#cv-hair", {
          width: px(span(t, at(0.45), at(0.95), motion.move) * (stacked ? 360 : 300) * u),
        });
      if (cta) riseState(st, t, motion, u, "#cv-cta", null, at(0.55), { seconds: at(0.45) });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [{ at: lead, label: "Everything is in: the still is drawn from here on" }],
    };
  },
});
