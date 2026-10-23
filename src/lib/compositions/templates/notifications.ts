/**
 * Notifications arriving: cards that drop in one after another, the newest
 * on top and the older ones pressed down and dimmed, each from someone in the
 * brand's demo record. Where a reel shows the work reaching the people it is
 * for. Optionally one is pressed.
 */
import { z } from "zod";
import { beatsAcross, groundHtml, pointerHtml, pointerState } from "../kit";
import { CompositionState, escapeHtml, fade, px, r3, span } from "../state";
import { defineTemplate } from "../types";

const schema = z.object({
  /** One a line: "Title | what it says". */
  items: z
    .array(z.string().max(160))
    .min(1)
    .max(5)
    .default([
      "{{client.name}} | Approved the report for {{record.title}}",
      "{{person.name}} | Shared the file with {{client.name}}",
      "{{record.reference}} | Status changed to {{record.status}}",
    ]),
  app: z.string().max(40).default(""),
  press: z.boolean().default(true),
});

export const notificationsTemplate = defineTemplate({
  id: "notifications",
  version: 2,
  title: "Notifications",
  description:
    "Notifications drop in one after another, the newest on top, each from someone in the demo record; the last can be pressed.",
  group: "kit",
  schema,
  fields: [
    { key: "items", label: "Notifications (Title | text, one a line)", kind: "lines", max: 5 },
    { key: "app", label: "App name (empty: the brand's)", kind: "text", max: 40 },
    { key: "press", label: "Press the newest", kind: "toggle" },
  ],
  duration: { default: 5, min: 2.5, max: 20 },
  build({ params, brand, motion, width, height, u, duration, fill }) {
    const portrait = height >= width;
    const items = params.items.map((line) => {
      const filled = fill(line);
      const split = filled.indexOf("|");
      return split >= 0
        ? { title: filled.slice(0, split).trim(), body: filled.slice(split + 1).trim() }
        : { title: filled.trim(), body: "" };
    });
    const n = items.length;
    const app = escapeHtml(fill(params.app) || brand.name);
    const cardW = Math.min(width * (portrait ? 0.86 : 0.46), 900 * u);
    const cardH = 168 * u;
    const gap = 26 * u;
    const top = portrait ? height * 0.3 : height * 0.22;
    const x = (width - cardW) / 2;
    const arrivals = beatsAcross(
      duration,
      items.map((_item, k) => (n === 1 ? 0 : k / (n - 1)) * 0.75),
      0.25,
      params.press ? 1.5 : 0.9,
    );
    const pressAt = arrivals[n - 1]! + 0.9;
    const initials = (name: string) =>
      escapeHtml(
        name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0]!.toUpperCase())
          .join("") || "•",
      );

    const css = `
.nt-card { left:${px(x)}; width:${px(cardW)}; height:${px(cardH)}; display:flex; gap:${px(24 * u)}; align-items:center; padding:0 ${px(30 * u)}; }
.nt-icon { flex:none; width:${px(84 * u)}; height:${px(84 * u)}; border-radius:${px(22 * u)}; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg, var(--c-accent), var(--c-highlight)); color:#fff; font-weight:700; font-size:${px(32 * u)}; }
.nt-text { flex:1; min-width:0; }
.nt-app { font-size:${px(20 * u)}; letter-spacing:.08em; text-transform:uppercase; color:var(--c-muted); display:flex; justify-content:space-between; }
.nt-title { margin-top:${px(6 * u)}; font-size:${px(31 * u)}; font-weight:700; color:var(--c-ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nt-body { margin-top:${px(4 * u)}; font-size:${px(27 * u)}; color:var(--c-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
    const html = [
      groundHtml(),
      items
        .map(
          (item, k) =>
            `<div class="cx-glass nt-card" id="nt-${k}" style="top:${px(top)};visibility:hidden"><div class="nt-icon">${initials(item.title)}</div>` +
            `<div class="nt-text"><div class="nt-app"><span>${app}</span><span>now</span></div><div class="nt-title">${escapeHtml(item.title)}</div>` +
            `${item.body ? `<div class="nt-body">${escapeHtml(item.body)}</div>` : ""}</div></div>`,
        )
        .join(""),
      params.press ? pointerHtml() : "",
    ].join("");

    const state = (t: number) => {
      const st = new CompositionState();
      items.forEach((_item, k) => {
        const inP = span(t, arrivals[k]! - 0.05, arrivals[k]! + 0.45, motion.settle);
        // How many have arrived after this one: each pushes it down a place.
        let below = 0;
        for (let later = k + 1; later < n; later += 1)
          below += span(t, arrivals[later]!, arrivals[later]! + 0.45, motion.move);
        const y = (1 - inP) * -140 * u + below * (cardH + gap);
        const dim = 1 - 0.18 * Math.min(1, below);
        const pressed = params.press && k === n - 1 ? t - pressAt : -1;
        const sink = pressed >= 0 && pressed < 0.22 ? Math.sin((Math.PI * pressed) / 0.22) : 0;
        st.set(`#nt-${k}`, {
          transform: `translateY(${px(y)}) scale(${r3((0.94 + 0.06 * inP) * (1 - 0.025 * below) * (1 - 0.03 * sink))})`,
          "z-index": String(10 + k),
          ...fade(inP * dim),
        });
      });
      if (params.press)
        pointerState(st, t, motion, u, {
          from: [width * 0.85, height * (portrait ? 0.78 : 0.88)],
          to: [x + cardW * 0.62, top + cardH * 0.55],
          a: arrivals[n - 1]! + 0.2,
          b: pressAt - 0.08,
          show: arrivals[n - 1]! + 0.2,
          press: pressAt,
        });
      return st;
    };

    return {
      html,
      css,
      state,
      beats: [
        ...arrivals.map((at, k) => ({ at: at + 0.45, label: `Notification ${k + 1}` })),
        ...(params.press ? [{ at: pressAt, label: "Pressed" }] : []),
      ],
    };
  },
});
