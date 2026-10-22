/**
 * G-RECORD, the record card: one record from the brand's demo record, its
 * fields arriving one by one, its grade in a badge whose ring draws round to
 * the score, and the focus corners closing on the grade once it lands. A
 * figure that is modelled carries the product's illustrative-example label
 * (Reel 1's guardrails: nothing is shown as a real result).
 */
import { z } from "zod";
import { beatsAcross, cornersHtml, cornersState, groundHtml, riseState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  eyebrow: z.string().max(60).default("{{record.reference}}"),
  title: z.string().max(80).default("{{record.title}}"),
  subtitle: z.string().max(100).default("{{record.subtitle}}"),
  /** One field a line, as "Label: value". */
  fields: z
    .array(z.string().max(120))
    .max(6)
    .default(["Owner: {{person.name}}", "Client: {{client.name}}", "Status: {{record.status}}"]),
  grade: z.string().max(40).default("{{record.grade}}"),
  score: z.string().max(40).default("{{record.score}}"),
  verdict: z.string().max(60).default("{{record.verdict}}"),
  note: z.string().max(60).default("Illustrative example"),
  corners: z.boolean().default(true),
  demoLabel: z.boolean().default(true),
});

export const recordTemplate = defineTemplate({
  id: "record-card",
  version: 1,
  title: "Record card",
  description:
    "A record from the brand's demo record: its fields arrive one by one, its grade lands in a badge whose ring draws to the score.",
  group: "kit",
  schema,
  fields: [
    { key: "eyebrow", label: "Eyebrow", kind: "text", max: 60 },
    { key: "title", label: "Title", kind: "text", max: 80 },
    { key: "subtitle", label: "Subtitle", kind: "text", max: 100 },
    { key: "fields", label: "Fields (Label: value, one a line)", kind: "lines", max: 6 },
    { key: "grade", label: "Grade", kind: "text", max: 40 },
    { key: "score", label: "Score (0-100)", kind: "text", max: 40 },
    { key: "verdict", label: "Verdict", kind: "text", max: 60 },
    { key: "note", label: "Note under the grade", kind: "text", max: 60 },
    { key: "corners", label: "Focus corners on the grade", kind: "toggle" },
    { key: "demoLabel", label: "Demo workspace label", kind: "toggle" },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const cardW = Math.min(width * (portrait ? 0.86 : 0.5), 900 * u);
    const rows = params.fields
      .map((line) => {
        const filled = fill(line);
        const split = filled.indexOf(":");
        return split > 0
          ? { label: filled.slice(0, split).trim(), value: filled.slice(split + 1).trim() }
          : { label: "", value: filled.trim() };
      })
      .filter((row) => row.label || row.value);
    const cardH = (300 + (params.verdict ? 70 : 0) + rows.length * 82 + 40) * u;
    const cardX = (width - cardW) / 2;
    const cardY = (portrait ? height * 0.45 : height * 0.5) - cardH / 2;
    const scoreValue = Number(fill(params.score).replace(/[^\d.]/g, ""));
    const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0;
    const grade = escapeHtml(fill(params.grade).slice(0, 4));
    const verdict = escapeHtml(fill(params.verdict).slice(0, 30));
    const note = escapeHtml(fill(params.note));
    const badge = 190 * u;
    const badgeX = cardX + cardW - badge - 46 * u;
    const badgeY = cardY + 46 * u;
    const ring = 2 * Math.PI * 84;

    const rise = Math.min(0.55, duration * 0.13);
    const [firstRow, gradeAt] = beatsAcross(duration, [0, 0.62], rise + 0.1, 1.1);
    const rowAt = (k: number) =>
      firstRow! + k * Math.min(0.32, (gradeAt! - firstRow! - 0.2) / Math.max(1, rows.length));

    const css = `
.rc-card { left:${px(cardX)}; top:${px(cardY)}; width:${px(cardW)}; height:${px(cardH)}; padding:${px(46 * u)}; }
.rc-eyebrow { margin-bottom:${px(14 * u)}; }
.rc-title { font-family:var(--f-display); font-size:${px(58 * u)}; line-height:1.1; color:var(--c-ink); max-width:${px(cardW - badge - 120 * u)}; }
.rc-sub { margin-top:${px(10 * u)}; font-size:${px(28 * u)}; color:var(--c-muted); max-width:${px(cardW - badge - 120 * u)}; }
.rc-rule { margin:${px(34 * u)} 0 ${px(10 * u)}; height:1px; background:var(--c-line); }
.rc-row { display:flex; justify-content:space-between; gap:${px(24 * u)}; padding:${px(22 * u)} 0; border-bottom:1px solid var(--c-line); font-size:${px(30 * u)}; }
.rc-row b { font-weight:500; color:var(--c-muted); }
.rc-row span { color:var(--c-ink); font-weight:600; text-align:right; }
.rc-badge { position:absolute; left:${px(badgeX)}; top:${px(badgeY)}; width:${px(badge)}; height:${px(badge)}; z-index:5; }
.rc-badge svg { position:absolute; inset:0; width:100%; height:100%; transform:rotate(-90deg); }
.rc-grade { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.rc-grade b { font-family:var(--f-display); font-size:${px(78 * u)}; line-height:1; color:var(--c-highlight); }
.rc-grade span { margin-top:${px(6 * u)}; font-size:${px(22 * u)}; color:var(--c-muted); letter-spacing:.06em; }
.rc-verdict { margin-top:${px(18 * u)}; }
.rc-note { position:absolute; left:${px(cardX)}; width:${px(cardW)}; top:${px(cardY + cardH + 24 * u)}; text-align:center;
  font-size:${px(22 * u)}; color:var(--c-muted); letter-spacing:.04em; }
`;
    const html = [
      groundHtml(),
      `<div class="cx-card rc-card" id="rc-card">`,
      `<div class="cx-eyebrow rc-eyebrow" id="rc-eyebrow">${escapeHtml(fill(params.eyebrow))}</div>`,
      `<div class="rc-title" id="rc-title">${escapeHtml(fill(params.title))}</div>`,
      `<div class="rc-sub" id="rc-sub">${escapeHtml(fill(params.subtitle))}</div>`,
      verdict ? `<div class="cx-chip hi rc-verdict" id="rc-verdict">${verdict}</div>` : "",
      `<div class="rc-rule"></div>`,
      rows
        .map(
          (row, k) =>
            `<div class="rc-row" id="rc-row-${k}"><b>${escapeHtml(row.label)}</b><span>${escapeHtml(row.value)}</span></div>`,
        )
        .join(""),
      `</div>`,
      grade
        ? `<div class="rc-badge" id="rc-badge"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="84" fill="none" stroke="var(--c-line)" stroke-width="10"/>` +
          `<circle id="rc-ring" cx="100" cy="100" r="84" fill="none" stroke="var(--c-highlight)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${r3(ring)}" stroke-dashoffset="${r3(ring)}"/></svg>` +
          `<div class="rc-grade"><b>${grade}</b>${score ? `<span id="rc-score">${Math.round(score)}</span>` : ""}</div></div>`
        : "",
      note && grade ? `<div class="rc-note" id="rc-note">${note}</div>` : "",
      params.demoLabel
        ? `<div class="cx-demo" id="cx-demo" style="left:${px(cardX)};top:${px(cardY - 52 * u)}">${escapeHtml(brand.demo.label)}</div>`
        : "",
      params.corners && grade ? cornersHtml() : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      const up = span(t, 0, rise, motion.settle);
      st.set("#rc-card", { transform: `translateY(${px((1 - up) * 70 * u)})`, ...fade(up) });
      if (params.demoLabel) st.set("#cx-demo", fade(span(t, rise, rise + 0.3, motion.linear)));
      riseState(st, t, motion, u, "#rc-eyebrow", null, rise * 0.4);
      riseState(st, t, motion, u, "#rc-title", null, rise * 0.6);
      riseState(st, t, motion, u, "#rc-sub", null, rise * 0.8);
      rows.forEach((_row, k) =>
        riseState(st, t, motion, u, `#rc-row-${k}`, null, rowAt(k), { lift: 16 }),
      );
      if (grade) {
        const land = span(t, gradeAt!, gradeAt! + 0.45, motion.settle);
        st.set("#rc-badge", { transform: `scale(${r3(0.6 + 0.4 * land)})`, ...fade(land) });
        const drawn = span(t, gradeAt! + 0.1, gradeAt! + 1.0, motion.move);
        st.set("#rc-ring", { "stroke-dashoffset": String(r3(ring * (1 - (drawn * score) / 100))) });
        if (verdict)
          st.set("#rc-verdict", fade(span(t, gradeAt! + 0.5, gradeAt! + 0.8, motion.linear)));
        if (note) st.set("#rc-note", fade(span(t, gradeAt! + 0.6, gradeAt! + 0.9, motion.linear)));
        if (params.corners)
          cornersState(
            st,
            t,
            motion,
            u,
            [badgeX, badgeY, badge, badge],
            gradeAt! + 0.55,
            gradeAt! + 1.0,
          );
      }
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: rise, label: "The card is in" },
        ...(grade ? [{ at: gradeAt! + 0.45, label: "The grade lands" }] : []),
      ],
    };
  },
});
