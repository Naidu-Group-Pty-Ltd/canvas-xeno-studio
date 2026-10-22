// Reel 1, shot 03.1 (third cut): the market moves, the client waits.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, r3, px, State, fade, captionHtml, caption, KIT } = M;
const DK = require("../desk.cjs");

const IDS = ["research", "sheet", "contact", "report", "phone"];

// ------------------------------------------------------------------ the desktop clock (G-CLOCK)
// It runs from Monday 9:14 AM and gathers speed, reaching Wednesday 4:52 PM as the room falls dark.
const DAYS = ["Monday", "Tuesday", "Wednesday"];
const FROM = 9 * 60 + 14;
const TO = 2 * 1440 + 16 * 60 + 52;
function clockText(u) {
  const minutes = Math.round(FROM + (TO - FROM) * Math.min(1, Math.max(0, u)) ** 2.1);
  const h = Math.floor((minutes % 1440) / 60);
  return `${DAYS[Math.floor(minutes / 1440)]} ${((h + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ------------------------------------------------------------------ the market ticker (G-TICKER)
// The listing site's own kind of news, on made-up streets of the film's made-up suburb.
const ITEMS = [
  ["New listing", "3 Myrtle Court, Banksia Rise", "$1.12m"],
  ["Price guide updated", "18 Lilly Pilly Way", "$1.25m – $1.35m"],
  ["Auction result", "7 Grevillea Street", "Sold $1.42m"],
  ["New listing", "22 Acacia Avenue", "$985,000"],
  ["Inspection booked", "14 Wattle Grove", "Sat 10:30 AM"],
  ["Price guide updated", "5 Kurrajong Close", "$1.08m – $1.15m"],
  ["Auction result", "41 Boronia Road", "Passed in $1.21m"],
  ["New listing", "9 Callistemon Drive", "$1.31m"],
];
const tickerHtml = () =>
  `<div id="wt-ticker" style="position:absolute;left:0;right:0;top:1176px;height:76px;z-index:42;overflow:hidden;
    background:rgba(255,255,255,.94);border-top:1px solid var(--reel-before-border);border-bottom:1px solid var(--reel-before-border);
    box-shadow:0 10px 30px rgba(17,24,39,.12);font-family:var(--reel-before-type);visibility:hidden">
    <div id="wt-strip" style="position:absolute;left:0;top:0;height:76px;display:flex;align-items:center;white-space:nowrap">${Array.from(
      { length: 6 },
      () =>
        ITEMS.map(
          ([kind, where, figure]) =>
            `<span style="display:inline-flex;align-items:center;gap:12px;padding:0 30px;font-size:25px;color:var(--reel-before-ink)">
              <b style="font-size:19px;letter-spacing:.06em;text-transform:uppercase;color:var(--reel-before-ink-muted)">${kind}</b>${where}
              <b>${figure}</b></span><i style="width:6px;height:6px;border-radius:50%;background:var(--reel-before-border)"></i>`,
        ).join(""),
    ).join("")}</div></div>`;
// How far the strip has run u seconds in (px): slow, then faster and faster.
const tickerAt = (u) => 150 * u + 70 * u * u + 32 * u * u * u;

// ------------------------------------------------------------------ the notifications (NEW-NOTIFICATIONS)
// Each flies in from its own edge to where it stops, one after another.
const NOTES = [
  { key: "mail", at: [380, 404], from: [1200, 0] },
  { key: "chat", at: [24, 600], from: [-760, 0] },
  { key: "calendar", at: [330, 790], from: [0, -900] },
  { key: "plan", at: [400, 970], from: [1100, 120] },
  { key: "crm", at: [40, 1010], from: [-760, 260] },
];

/**
 * The four tools hold in their depth; the desktop clock in the corner starts to run and a market ticker scrolls
 * across the lower third, speeding up; two chips blink beside it. Notifications fly in from every edge (mail,
 * chat, the calendar, the CRM, a floor plan received for 14 Wattle Grove), each pushing the windows further apart
 * and out of focus. Then everything falls away into the dark but a phone on the desk, face up: its lock screen
 * lights with Jordan Ellis's follow-up, Wednesday 4:52 PM, and the camera pushes slowly down to it. Its light
 * fades a little and the frame dims toward dark, for the drop.
 */
function waitsScene() {
  const [tHold, tFaster, tNotes, tDark, tDim] = [0, 1, 2, 3, 4].map((i) => beat("03.1", i));
  const tOut = M.shotOf("03.1").out;
  const html = () =>
    [
      `<style>${DK.CSS}</style>`,
      DK.roomHtml(IDS),
      `<div style="position:absolute;inset:0;z-index:43;pointer-events:none">${KIT.clock(36, 268, `<span id="wt-clock-t">${clockText(0)}</span>`).replace('class="fk-clock"', 'class="fk-clock" id="wt-clock"')}</div>`,
      tickerHtml(),
      ["Price guide updated", "Inspection booked"]
        .map(
          (c, i) =>
            `<span class="ls-chip" id="wt-chip-${i}" style="position:absolute;left:${40 + i * 300}px;top:1112px;z-index:43;font-size:22px;padding:8px 16px;
              background:var(--reel-before-surface);box-shadow:0 8px 20px rgba(17,24,39,.16);visibility:hidden">${c}</span>`,
        )
        .join(""),
      `<div style="position:absolute;inset:0;z-index:44;pointer-events:none">${NOTES.map(
        (n) =>
          `<div id="wt-note-${n.key}" style="position:absolute;left:0;top:0;visibility:hidden">${KIT.note(n.key, 0, 0)}</div>`,
      ).join("")}</div>`,
      // Under the captions, which stay readable while the frame dims.
      `<div id="wt-dark" style="position:absolute;inset:0;z-index:39;background:#000;opacity:0;pointer-events:none"></div>`,
      captionHtml(),
    ].join("");

  const state = (time, m) => {
    const st = new State();
    const t = DK.tick(time, time > tDark - 0.1 && time < tDark + 2.0 ? 240 : 120);
    caption(st, t, m);
    const c = DK.cameraAt(t);
    // The notifications push the windows apart (each away from the middle of the four) and out of focus; then,
    // as the room falls dark, they drop away and go.
    const push = span(t, tNotes, tNotes + 2.2, EASE.settle);
    const fall = span(t, tDark, tDark + 0.9, EASE.move);
    const APART = { research: [-420, -260, 0], sheet: [460, -120, 200], contact: [-380, 260, -150], report: [300, 420, 300] };
    const poses = {};
    for (const id of DK.TOOLS) {
      const o = DK.OBJECTS[id].pose;
      poses[id] = { p: o.p.map((v, i) => v + APART[id][i] * push + (i === 1 ? 900 * fall * fall : 0)), ry: o.ry * (1 + 0.6 * push) };
    }
    const fades = { ...DK.fadesAt(t), ...Object.fromEntries(DK.TOOLS.map((id) => [id, 1 - span(t, tDark + 0.1, tDark + 0.8, EASE.linear)])) };
    const light = lerp(1, 0.07, span(t, tDark, tDark + 1.0, EASE.settle));
    // Focus pulled forward as the notifications arrive, so the windows behind them soften; then back to the
    // camera's own subject, the phone, as the room falls dark.
    const focus = c.dist * lerp(lerp(1, 0.55, push), 1, span(t, tDark, tDark + 0.6, EASE.settle));
    DK.placeRoom(st, c, IDS, { poses, fades, focus, dof: 12, light });

    // The phone lights with the follow-up; its light fades a little at the end.
    const lit = span(t, tDark + 0.15, tDark + 0.55, EASE.settle) * lerp(1, 0.62, span(t, tDim, tOut, EASE.linear));
    st.set("#dk-lit", { opacity: r3(lit) });
    const nt = span(t, tDark + 0.35, tDark + 0.75, EASE.settle);
    st.set("#dk-nt", { transform: `translateY(${px((1 - nt) * 30)}) scale(${r3(0.94 + 0.06 * nt)})`, ...fade(nt) });

    // The overlays fall away with the room.
    const away = 1 - span(t, tDark, tDark + 0.5, EASE.linear);
    // The clock runs from Monday 9:14 to Wednesday 4:52 PM, ticking ten times a second.
    const u = (Math.floor((t - tHold) * 10) / 10) / (tDark - tHold);
    st.set("#wt-clock-t", { $text: clockText(u) });
    st.set("#wt-clock", { ...fade(span(t, tHold, tHold + 0.3, EASE.linear) * away) });
    // The ticker: in from below, running, faster from the second beat.
    const tin = span(t, tHold, tHold + 0.45, EASE.settle);
    st.set("#wt-ticker", { transform: `translateY(${px((1 - tin) * 90)})`, ...fade(tin * away) });
    st.set("#wt-strip", { transform: `translateX(${px(-tickerAt(Math.max(0, t - tHold)))})` });
    // Its chips blink beside it.
    [0, 1].forEach((i) => {
      const s = t - (tFaster + i * 0.35);
      const on = s < 0 ? 0 : s < 0.9 ? (Math.floor(s / 0.15) % 2 === 0 ? 1 : 0.25) : 1;
      st.set(`#wt-chip-${i}`, { transform: `translateY(${px((1 - span(t, tFaster + i * 0.35, tFaster + i * 0.35 + 0.3, EASE.settle)) * 14)})`, ...fade(on * away) });
    });
    // The notifications, one after another, each from its own edge.
    NOTES.forEach((n, i) => {
      const a = tNotes + i * 0.42;
      const p = span(t, a, a + 0.45, EASE.settle);
      const x = n.at[0] + n.from[0] * (1 - p);
      const y = n.at[1] + n.from[1] * (1 - p) + 600 * fall * fall;
      st.set(`#wt-note-${n.key}`, { transform: `translate(${px(x)}, ${px(y)}) scale(0.86)`, "transform-origin": "0 0", ...fade(span(t, a, a + 0.12, EASE.linear) * away) });
    });
    // The frame dims toward dark, for the drop.
    st.set("#wt-dark", { opacity: r3(0.86 * span(t, tDim, tOut, EASE.linear)) });
    return st;
  };
  return { id: "waits", shots: ["03.1"], palette: "before", html, state };
}

module.exports = waitsScene;
