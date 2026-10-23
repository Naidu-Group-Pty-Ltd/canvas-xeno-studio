/**
 * A client's file in the product, from the brand's demo record: who they are
 * (their initials, name, company and where they are), the file's tabs, its
 * overview, then the pointer pressing Documents: the tab's underline slides
 * across and the documents arrive in its place.
 */
import { z } from "zod";
import { beatsAcross, groundHtml, pointerHtml, pointerState } from "../kit";
import { demoList, demoValue, type DemoRecord } from "../demo";
import { CompositionState, escapeHtml, fade, lerp, px, span } from "../state";
import { defineTemplate } from "../types";
import { initialsOf, productShell } from "./product";

const schema = z.object({
  section: z.string().max(40).default("Client file"),
  /** The overview's fields, one a line: "Label: value". */
  overview: z
    .array(z.string().max(120))
    .max(6)
    .default([
      "Company: {{client.company}}",
      "Location: {{client.location}}",
      "Record: {{record.title}}",
      "Status: {{record.status}}",
    ]),
  /** The documents, one a line. None: the demo record's `documents` list, so the file holds the record's own. */
  documents: z.array(z.string().max(80)).max(6).default([]),
  open: z.boolean().default(true),
});

const TABS = ["Overview", "Documents", "Notes"];

/** Documents for a record with no `documents` list: plainly illustrative. */
const ILLUSTRATIVE_DOCUMENTS = [
  "Engagement letter.pdf",
  "{{record.title}} report.pdf",
  "Signed approval.pdf",
];

/**
 * The record's documents by name (each row's first column), so a client's
 * file never lists papers the record doesn't hold: Aurixa's, for one, shows
 * its contract and plans as the matter has them, not a signed approval.
 */
export function recordDocuments(demo: DemoRecord): string[] | null {
  const names = (demoList(demo, "documents")?.rows ?? [])
    .map((row) => row[0]?.trim() ?? "")
    .filter(Boolean);
  return names.length ? names.slice(0, 6) : null;
}

export const fileTemplate = defineTemplate({
  id: "client-file",
  version: 2,
  title: "Client file",
  description:
    "A client's file from the demo record: who they are and the file's overview, then Documents is pressed and its files arrive.",
  group: "product",
  schema,
  fields: [
    { key: "section", label: "Page title", kind: "text", max: 40 },
    { key: "overview", label: "Overview (Label: value, one a line)", kind: "lines", max: 6 },
    {
      key: "documents",
      label: "Documents (one a line; none: the demo record's documents)",
      kind: "lines",
      max: 6,
    },
    { key: "open", label: "Open Documents", kind: "toggle" },
  ],
  duration: { default: 6, min: 3, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const shell = productShell({
      brand,
      motion,
      width,
      height,
      u,
      duration,
      section: fill(params.section),
      active: 2,
    });
    const { content } = shell;
    const name = demoValue(brand.demo, "client.name") ?? "";
    const company = demoValue(brand.demo, "client.company") ?? "";
    const fields = params.overview
      .map((line) => {
        const filled = fill(line);
        const split = filled.indexOf(":");
        return split > 0
          ? { label: filled.slice(0, split).trim(), value: filled.slice(split + 1).trim() }
          : null;
      })
      .filter((field): field is { label: string; value: string } => field !== null);
    const documents = (
      params.documents.length
        ? params.documents
        : (recordDocuments(brand.demo) ?? ILLUSTRATIVE_DOCUMENTS)
    )
      .map((doc) => fill(doc))
      .filter(Boolean);
    const headH = 130 * u;
    const tabsTop = headH + 20 * u;
    const tabW = 190 * u;
    const panelTop = tabsTop + 80 * u;

    const [overviewAt, openAt] = beatsAcross(duration, [0, 0.45], shell.rise + 0.1, 1.4);
    const tabX = (k: number) => content.x + k * tabW + tabW / 2;

    const css = `${shell.css}
.fl-head { display:flex; align-items:center; gap:${px(24 * u)}; height:${px(headH)}; }
.fl-avatar { width:${px(104 * u)}; height:${px(104 * u)}; border-radius:50%; background:linear-gradient(135deg, var(--c-accent), var(--c-highlight));
  display:flex; align-items:center; justify-content:center; color:#fff; font-family:var(--f-display); font-size:${px(40 * u)}; font-weight:700; }
.fl-name { font-family:var(--f-display); font-size:${px(44 * u)}; color:var(--c-ink); }
.fl-co { margin-top:${px(6 * u)}; font-size:${px(25 * u)}; color:var(--c-muted); }
.fl-tabs { position:absolute; left:0; right:0; top:${px(tabsTop)}; height:${px(64 * u)}; display:flex; border-bottom:1px solid var(--c-line); }
.fl-tabs span { width:${px(tabW)}; text-align:center; font-size:${px(25 * u)}; font-weight:600; color:var(--c-muted); line-height:${px(64 * u)}; }
.fl-under { position:absolute; top:${px(tabsTop + 61 * u)}; left:0; width:${px(tabW - 30 * u)}; height:${px(4 * u)}; border-radius:${px(2 * u)}; background:var(--c-accent); }
.fl-panel { position:absolute; left:0; right:0; top:${px(panelTop)}; }
.fl-field { display:flex; justify-content:space-between; padding:${px(20 * u)} ${px(4 * u)}; border-bottom:1px solid var(--c-line); font-size:${px(26 * u)}; }
.fl-field b { font-weight:500; color:var(--c-muted); }
.fl-field span { font-weight:600; color:var(--c-ink); }
.fl-doc { display:flex; align-items:center; gap:${px(18 * u)}; padding:${px(18 * u)}; margin-bottom:${px(14 * u)}; border-radius:${px(16 * u)};
  background:var(--c-surface); border:1px solid var(--c-line); font-size:${px(25 * u)}; color:var(--c-ink); }
.fl-doc i { flex:none; width:${px(44 * u)}; height:${px(54 * u)}; border-radius:${px(6 * u)}; background:var(--c-raised); border:1px solid var(--c-line); position:relative; }
.fl-doc i::after { content:""; position:absolute; left:${px(9 * u)}; right:${px(9 * u)}; top:${px(14 * u)}; height:${px(3 * u)}; background:var(--c-accent); box-shadow:0 ${px(9 * u)} 0 var(--c-line), 0 ${px(18 * u)} 0 var(--c-line); }
`;
    const body = [
      `<div class="fl-head" id="fl-head"><div class="fl-avatar">${escapeHtml(initialsOf(name))}</div><div><div class="fl-name">${escapeHtml(name)}</div><div class="fl-co">${escapeHtml(company)}</div></div></div>`,
      `<div class="fl-tabs">${TABS.map((tab, k) => `<span id="fl-tab-${k}">${tab}</span>`).join("")}</div><div class="fl-under" id="fl-under"></div>`,
      `<div class="fl-panel" id="fl-overview">${fields
        .map(
          (field, k) =>
            `<div class="fl-field" id="fl-field-${k}"><b>${escapeHtml(field.label)}</b><span>${escapeHtml(field.value)}</span></div>`,
        )
        .join("")}</div>`,
      `<div class="fl-panel" id="fl-docs">${documents.map((doc, k) => `<div class="fl-doc" id="fl-doc-${k}"><i></i>${escapeHtml(doc)}</div>`).join("")}</div>`,
    ].join("");
    const html = [groundHtml(), shell.html(body), params.open ? pointerHtml() : ""].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      shell.state(st, t);
      st.set("#fl-head", {
        transform: `translateY(${px((1 - span(t, shell.rise * 0.6, shell.rise + 0.3, motion.settle)) * 20 * u)})`,
        ...fade(span(t, shell.rise * 0.6, shell.rise + 0.3, motion.linear)),
      });
      const moved = params.open ? span(t, openAt! + 0.02, openAt! + 0.42, motion.move) : 0;
      st.set("#fl-under", { transform: `translateX(${px(lerp(15 * u, tabW + 15 * u, moved))})` });
      TABS.forEach((_tab, k) => {
        const on = k === 0 ? 1 - moved : k === 1 ? moved : 0;
        st.set(`#fl-tab-${k}`, { color: on > 0.5 ? "var(--c-ink)" : "var(--c-muted)" });
      });
      const away = params.open ? span(t, openAt!, openAt! + 0.25, motion.linear) : 0;
      st.set("#fl-overview", fade(1 - away));
      fields.forEach((_field, k) => {
        const p = span(t, overviewAt! + k * 0.1, overviewAt! + k * 0.1 + 0.35, motion.settle);
        st.set(`#fl-field-${k}`, { transform: `translateY(${px((1 - p) * 16 * u)})`, ...fade(p) });
      });
      documents.forEach((_doc, k) => {
        const p = params.open
          ? span(t, openAt! + 0.25 + k * 0.12, openAt! + 0.6 + k * 0.12, motion.settle)
          : 0;
        st.set(`#fl-doc-${k}`, { transform: `translateX(${px((1 - p) * 40 * u)})`, ...fade(p) });
      });
      if (params.open)
        pointerState(st, t, motion, u, {
          from: [width * 0.84, height * 0.8],
          to: [tabX(1), content.y + tabsTop + 34 * u],
          a: openAt! - 0.8,
          b: openAt! - 0.08,
          show: openAt! - 0.8,
          press: openAt!,
        });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        { at: overviewAt! + 0.4, label: "The overview is in" },
        ...(params.open ? [{ at: openAt!, label: "Documents opened" }] : []),
      ],
    };
  },
});
