/**
 * G-DOCUMENT: a page that rises out of the ground and lands flat, its heading
 * and lines arriving in reading order, a signature drawn in one stroke and a
 * stamp pressed on it with the brand's press. Where a reel shows the thing a
 * product delivers: a report, a contract, an approval.
 */
import { z } from "zod";
import { beatsAcross, groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  kicker: z.string().max(60).default("{{record.reference}}"),
  title: z.string().max(80).default("{{record.title}}"),
  subtitle: z.string().max(100).default("Prepared for {{client.name}}"),
  lines: z
    .array(z.string().max(140))
    .max(8)
    .default([
      "Summary of the findings and what they mean for the decision.",
      "Every figure is drawn from the record, with its source named.",
      "Recommendations, in order, with what each depends on.",
    ]),
  signature: z.boolean().default(true),
  signedBy: z.string().max(60).default("{{person.name}}"),
  stamp: z.string().max(24).default("Approved"),
  paper: z.enum(["light", "brand"]).default("light"),
});

export const documentTemplate = defineTemplate({
  id: "document",
  version: 1,
  title: "Document",
  description:
    "A page rises and lands flat, its lines arrive in reading order, a signature is drawn and a stamp is pressed on it.",
  group: "kit",
  schema,
  fields: [
    { key: "kicker", label: "Kicker", kind: "text", max: 60 },
    { key: "title", label: "Title", kind: "text", max: 80 },
    { key: "subtitle", label: "Subtitle", kind: "text", max: 100 },
    { key: "lines", label: "Lines (one a line)", kind: "lines", max: 8 },
    { key: "signature", label: "Signature", kind: "toggle" },
    { key: "signedBy", label: "Signed by", kind: "text", max: 60 },
    { key: "stamp", label: "Stamp (empty for none)", kind: "text", max: 24 },
    { key: "paper", label: "Paper", kind: "choice", options: ["light", "brand"] },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const pageW = Math.min(width * (portrait ? 0.8 : 0.42), 860 * u);
    const pageH = pageW * 1.414;
    const pageX = (width - pageW) / 2;
    const pageY = (portrait ? height * 0.47 : height * 0.5) - pageH / 2;
    const light = params.paper === "light";
    const lines = params.lines.map((line) => escapeHtml(fill(line))).filter(Boolean);
    const stamp = escapeHtml(fill(params.stamp));
    const signedBy = escapeHtml(fill(params.signedBy));

    const rise = Math.min(0.75, duration * 0.18);
    const [firstLine, signAt, stampAt] = beatsAcross(duration, [0, 0.55, 0.8], rise, 0.9);
    const lineAt = (k: number) =>
      firstLine! + k * Math.min(0.26, (signAt! - firstLine! - 0.1) / Math.max(1, lines.length));

    const ink = light ? "#111827" : "var(--c-ink)";
    const muted = light ? "#6b7280" : "var(--c-muted)";
    const css = `
.dc-page { position:absolute; left:${px(pageX)}; top:${px(pageY)}; width:${px(pageW)}; height:${px(pageH)}; overflow:hidden;
  padding:${px(70 * u)} ${px(64 * u)}; border-radius:${px(10 * u)}; transform-origin:50% 100%;
  background:${light ? "#fbfbf8" : "var(--c-surface)"}; color:${ink};
  box-shadow:0 ${px(40 * u)} ${px(100 * u)} rgba(0,0,0,.45), 0 ${px(4 * u)} ${px(10 * u)} rgba(0,0,0,.2); }
.dc-band { position:absolute; left:0; right:0; top:0; height:${px(14 * u)}; background:linear-gradient(90deg, var(--c-accent), var(--c-highlight)); }
.dc-brand { font-size:${px(22 * u)}; letter-spacing:.2em; text-transform:uppercase; color:${muted}; margin-bottom:${px(40 * u)}; }
.dc-kicker { font-size:${px(22 * u)}; letter-spacing:.14em; text-transform:uppercase; color:var(--c-accent); margin-bottom:${px(12 * u)}; }
.dc-title { font-family:var(--f-display); font-size:${px(54 * u)}; line-height:1.1; }
.dc-sub { margin-top:${px(12 * u)}; font-size:${px(26 * u)}; color:${muted}; }
.dc-rule { margin:${px(40 * u)} 0 ${px(30 * u)}; height:1px; background:${light ? "#e5e7eb" : "var(--c-line)"}; }
.dc-line { font-size:${px(27 * u)}; line-height:1.5; margin-bottom:${px(22 * u)}; color:${ink}; }
.dc-fill { height:${px(13 * u)}; border-radius:${px(7 * u)}; margin-bottom:${px(24 * u)}; background:${light ? "#e8e8e3" : "var(--c-line)"}; }
.dc-sign { position:absolute; left:${px(64 * u)}; bottom:${px(90 * u)}; width:${px(330 * u)}; }
.dc-sign svg { display:block; width:100%; height:${px(110 * u)}; overflow:visible; }
.dc-sign div { border-top:1px solid ${light ? "#d1d5db" : "var(--c-line)"}; padding-top:${px(10 * u)}; font-size:${px(22 * u)}; color:${muted}; }
.dc-stamp { position:absolute; right:${px(60 * u)}; bottom:${px(110 * u)}; padding:${px(14 * u)} ${px(26 * u)};
  border:${px(5 * u)} solid var(--c-accent); border-radius:${px(12 * u)}; color:var(--c-accent);
  font-family:var(--f-display); font-size:${px(44 * u)}; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  transform-origin:50% 50%; }
`;
    const FILL = [94, 88, 91, 70, 86, 62];
    // One stroke of a signature: drawn from start to end as it is signed.
    const signature =
      "M8 78 C40 18, 70 18, 66 66 S98 96, 120 52 S150 12, 160 60 S196 92, 214 40 S246 30, 258 70 S290 84, 316 46";
    const html = [
      groundHtml(),
      `<div class="dc-page" id="dc-page"><div class="dc-band"></div>`,
      `<div class="dc-brand">${escapeHtml(brand.name)}</div>`,
      `<div class="dc-kicker" id="dc-kicker">${escapeHtml(fill(params.kicker))}</div>`,
      `<div class="dc-title" id="dc-title">${escapeHtml(fill(params.title))}</div>`,
      `<div class="dc-sub" id="dc-sub">${escapeHtml(fill(params.subtitle))}</div>`,
      `<div class="dc-rule"></div>`,
      lines.map((line, k) => `<div class="dc-line" id="dc-line-${k}">${line}</div>`).join(""),
      // The rest of the document, as texture: the page reads as a full one.
      `<div id="dc-fill">${FILL.map((share) => `<div class="dc-fill" style="width:${share}%"></div>`).join("")}</div>`,
      params.signature
        ? `<div class="dc-sign"><svg viewBox="0 0 330 110"><path id="dc-ink" d="${signature}" fill="none" stroke="${light ? "#1f2a44" : "var(--c-ink)"}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000"/></svg><div>${signedBy}</div></div>`
        : "",
      stamp ? `<div class="dc-stamp" id="dc-stamp">${stamp}</div>` : "",
      `</div>`,
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, 0, rise, motion.settle);
      st.set("#dc-page", {
        transform: `perspective(${px(1800 * u)}) translateY(${px((1 - up) * 260 * u)}) rotateX(${r3((1 - up) * 28)}deg)`,
        ...fade(Math.min(1, up * 1.6)),
      });
      riseState(st, t, motion, u, "#dc-kicker", null, rise * 0.7, { lift: 12 });
      riseState(st, t, motion, u, "#dc-title", null, rise * 0.85, { lift: 14 });
      riseState(st, t, motion, u, "#dc-sub", null, rise, { lift: 12 });
      lines.forEach((_line, k) =>
        riseState(st, t, motion, u, `#dc-line-${k}`, null, lineAt(k), { lift: 10, blur: 4 }),
      );
      st.set(
        "#dc-fill",
        fade(span(t, lineAt(lines.length - 1), lineAt(lines.length - 1) + 0.4, motion.linear)),
      );
      if (params.signature)
        st.set("#dc-ink", {
          "stroke-dashoffset": String(
            r3(1000 * (1 - span(t, signAt!, signAt! + 0.9, motion.move))),
          ),
        });
      if (stamp) {
        // Pressed on: from above the page, down with the brand's press, a small kick as it lands.
        const press = span(t, stampAt!, stampAt! + motion.pressSeconds, motion.settle);
        const kick =
          t > stampAt! + motion.pressSeconds && t < stampAt! + motion.pressSeconds + 0.18
            ? 0.02
            : 0;
        st.set("#dc-stamp", {
          transform: `rotate(-8deg) scale(${r3(1.6 - 0.6 * press - kick)})`,
          ...fade(span(t, stampAt!, stampAt! + 0.12, motion.linear) * 0.92),
        });
      }
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rise, label: "The page lands" },
        ...(params.signature ? [{ at: signAt! + 0.9, label: "Signed" }] : []),
        ...(stamp ? [{ at: stampAt! + motion.pressSeconds, label: "Stamped" }] : []),
      ],
    };
  },
});
