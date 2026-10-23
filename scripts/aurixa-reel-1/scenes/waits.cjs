// Reel 1, shot 03.1 (third cut): the market moves, the client waits.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, r3, px, State, fade, captionHtml, caption, KIT } = M;
const DK = require("../desk.cjs");

const IDS = ["research", "sheet", "contact", "report", "phone"];

// ------------------------------------------------------------------ the waiting clock (G-CLOCK)
// It runs from Monday 9:14 AM, when Jordan's enquiry came in, and gathers speed, reaching Wednesday 4:52 PM as the
// room falls dark. It is the one thing in the room drawn in the brand's colours (at the client's direction,
// 23 October 2026): today's desktop clock would be a small white pill, and the wait has to be felt. A navy glass
// card with a gold edge and glow, the weekday in the brand's mono capitals, the time in the trial card's gold, a
// ring that fills as the wait grows (the trial ring's gradient: the wait here, the fourteen days there), hands
// that spin faster and faster, and how long the client has been waiting. Each new day the card flares.
const DAYS = ["Monday", "Tuesday", "Wednesday"];
const FROM = 9 * 60 + 14;
const TO = 2 * 1440 + 16 * 60 + 52;
const minutesAt = (u) => FROM + (TO - FROM) * Math.min(1, Math.max(0, u)) ** 2.1;
const pad = (n) => String(n).padStart(2, "0");
function clockParts(u) {
  const minutes = Math.round(minutesAt(u));
  const h = Math.floor((minutes % 1440) / 60);
  const waited = minutes - FROM;
  return {
    day: DAYS[Math.floor(minutes / 1440)],
    hm: `${((h + 11) % 12) + 1}:${pad(minutes % 60)}`,
    ap: h < 12 ? "AM" : "PM",
    waited: `${Math.floor(waited / 1440)}D ${pad(Math.floor((waited % 1440) / 60))}H ${pad(waited % 60)}M`,
  };
}
// Where it stands (frame px): in the rail's band below the platforms' own buttons, clear of the mail notification
// that lands at (380, 404).
const CLK = { x: 36, y: 262, w: 470, h: 140, ring: 108, stroke: 8 };
CLK.r = (CLK.ring - CLK.stroke) / 2;
CLK.c = 2 * Math.PI * CLK.r;
const clockCss = `
.wt-clk { position:absolute; left:${CLK.x}px; top:${CLK.y}px; width:${CLK.w}px; height:${CLK.h}px; box-sizing:border-box; border-radius:20px;
  display:flex; align-items:center; gap:22px; padding:0 22px 0 16px; overflow:hidden; transform-origin:${CLK.ring / 2 + 16}px 50%;
  background:linear-gradient(160deg, rgba(16,35,61,.97), rgba(4,11,22,.97)); border:1.5px solid rgba(215,179,95,.8); color:var(--reel-ink); }
.wt-clk::before { content:""; position:absolute; inset:0; background:var(--reel-sheen); pointer-events:none; }
.wt-clk svg { flex:none; position:relative; }
.wt-clk .hand { transform-box:view-box; transform-origin:${CLK.ring / 2}px ${CLK.ring / 2}px; }
.wt-clk .txt { position:relative; display:flex; flex-direction:column; min-width:0; }
.wt-clk .day { font-family:"Inconsolata", ui-monospace, monospace; font-weight:700; font-size:21px; line-height:1; letter-spacing:.28em;
  text-transform:uppercase; color:var(--reel-gold-ink); }
.wt-clk .time { display:flex; align-items:baseline; gap:10px; margin-top:6px; font-family:var(--reel-sans); font-weight:700; line-height:1;
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.wt-clk .time b { font-size:66px; letter-spacing:-.02em; background:linear-gradient(180deg, #F5D17A 8%, #D7B35F 58%, #C89B3C 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent; }
.wt-clk .time small { font-size:26px; color:var(--reel-gold-ink); letter-spacing:.04em; }
.wt-clk .wait { display:flex; align-items:center; gap:9px; margin-top:9px; font-family:"Inconsolata", ui-monospace, monospace; font-weight:700;
  font-size:15px; line-height:1; letter-spacing:.2em; text-transform:uppercase; color:var(--reel-ink-muted); white-space:nowrap; }
.wt-clk .wait i { width:9px; height:9px; border-radius:50%; background:#F5D17A; box-shadow:0 0 10px #d7b35f; }
.wt-clk .wait b { color:var(--reel-ink); font-variant-numeric:tabular-nums; }`;
function clockHtml() {
  const o = CLK.ring / 2;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const [r0, r1] = i % 3 === 0 ? [CLK.r - 15, CLK.r - 6] : [CLK.r - 11, CLK.r - 6];
    return `<line x1="${r3(o + r0 * Math.sin(a))}" y1="${r3(o - r0 * Math.cos(a))}" x2="${r3(o + r1 * Math.sin(a))}" y2="${r3(o - r1 * Math.cos(a))}"/>`;
  }).join("");
  const p = clockParts(0);
  return `<div class="wt-clk" id="wt-clock">
    <svg width="${CLK.ring}" height="${CLK.ring}" viewBox="0 0 ${CLK.ring} ${CLK.ring}">
      <defs><linearGradient id="wt-clk-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5D17A"/><stop offset=".55" stop-color="#D7B35F"/><stop offset="1" stop-color="#5EDDE8"/></linearGradient></defs>
      <circle cx="${o}" cy="${o}" r="${r3(CLK.r)}" fill="rgba(4,11,22,.6)" stroke="rgba(255,255,255,.12)" stroke-width="${CLK.stroke}"/>
      <circle id="wt-clk-arc" cx="${o}" cy="${o}" r="${r3(CLK.r)}" fill="none" stroke="url(#wt-clk-rg)" stroke-width="${CLK.stroke}" stroke-linecap="round"
        stroke-dasharray="${r3(CLK.c)}" stroke-dashoffset="${r3(CLK.c)}" transform="rotate(-90 ${o} ${o})"/>
      <g stroke="rgba(215,179,95,.55)" stroke-width="2.4" stroke-linecap="round">${ticks}</g>
      <line class="hand" id="wt-clk-h" x1="${o}" y1="${o}" x2="${o}" y2="${o - 25}" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
      <line class="hand" id="wt-clk-m" x1="${o}" y1="${o + 6}" x2="${o}" y2="${o - 36}" stroke="#F5D17A" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="${o}" cy="${o}" r="5" fill="#F5D17A"/>
    </svg>
    <div class="txt"><div class="day" id="wt-clock-day">${p.day}</div>
      <div class="time"><b id="wt-clock-t">${p.hm}</b><small id="wt-clock-ap">${p.ap}</small></div>
      <div class="wait"><i id="wt-clock-dot"></i>Client waiting<b id="wt-clock-w">${p.waited}</b></div></div></div>`;
}
// The moments the clock turns to a new day (Tuesday, Wednesday), as shares of its run, for the card's flare.
const NEW_DAYS = [1, 2].map((d) => ((d * 1440 - FROM) / (TO - FROM)) ** (1 / 2.1));

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
// How far the strip has run u seconds in (px): 150 px a second, gathering to 1,350 by the fall into the dark (any
// faster and it no longer reads as a ticker, only as a streak).
const tickerAt = (u) => 150 * u + 87 * u * u;

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
      `<style>${DK.CSS}${clockCss}</style>`,
      DK.roomHtml(IDS),
      `<div style="position:absolute;inset:0;z-index:43;pointer-events:none">${clockHtml()}</div>`,
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
    // Two clocks. The room (its blurred windows the costly part of a drawing) ticks twice a frame but for the push
    // down to the phone; the ticker and the notifications, fast and light, take every subframe once the ticker
    // runs fast, so they blur rather than strobe.
    const t = DK.tick(time, time > tDark - 0.05 && time < tDark + 1.8 ? Infinity : 120);
    const to = DK.tick(time, time > tHold + 1.4 ? Infinity : 120);
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

    // The overlays (on their own clock) fall away with the room.
    const away = 1 - span(to, tDark, tDark + 0.5, EASE.linear);
    const drop = span(to, tDark, tDark + 0.9, EASE.move) ** 2;
    // The clock runs from Monday 9:14 to Wednesday 4:52 PM, its words ticking ten times a second, and only between
    // frames (a tick inside a frame's shutter would print two times over each other); its hands and its ring run on
    // the overlays' own clock, so a hand that spins faster than the frame blurs as a camera would see it.
    const u =
      Math.floor((Math.round(to * M.FPS) / M.FPS - tHold) * 10 + 1e-6) / 10 / (tDark - tHold);
    const parts = clockParts(u);
    st.set("#wt-clock-day", { $text: parts.day });
    st.set("#wt-clock-t", { $text: parts.hm });
    st.set("#wt-clock-ap", { $text: parts.ap });
    st.set("#wt-clock-w", { $text: parts.waited });
    const run = (to - tHold) / (tDark - tHold);
    const minutes = minutesAt(run);
    st.set("#wt-clk-h", { transform: `rotate(${r3(((minutes % 720) / 720) * 360)}deg)` });
    st.set("#wt-clk-m", { transform: `rotate(${r3(((minutes % 60) / 60) * 360)}deg)` });
    st.set("#wt-clk-arc", {
      "stroke-dashoffset": `${r3(CLK.c * (1 - (minutes - FROM) / (TO - FROM)))}`,
    });
    // It arrives a little ahead of the room's own motion; its glow builds as the clock speeds up, and each new day
    // it flares and swells.
    const arrive = span(to, tHold, tHold + 0.35, EASE.settle);
    const flare = Math.max(
      0,
      ...NEW_DAYS.map((d) => {
        const s = to - (tHold + d * (tDark - tHold));
        return s >= 0 && s < 0.5 ? Math.sin((Math.PI * s) / 0.5) : 0;
      }),
    );
    const glow = 0.3 + 0.35 * span(to, tFaster, tDark, EASE.linear) + 0.45 * flare;
    st.set("#wt-clock", {
      transform: `translateY(${px(-12 * (1 - arrive))}) scale(${r3((0.94 + 0.06 * arrive) * (1 + 0.05 * flare))})`,
      "box-shadow": `0 18px 44px rgba(4,11,22,.42), 0 0 ${px(18 + 26 * glow)} rgba(215,179,95,${r3(0.25 + 0.4 * glow)})`,
      ...fade(span(to, tHold, tHold + 0.3, EASE.linear) * away),
    });
    // The live dot beside the wait, beating twice a second.
    st.set("#wt-clock-dot", {
      opacity: r3(0.35 + 0.65 * (0.5 + 0.5 * Math.cos(2 * Math.PI * 2 * Math.max(0, to - tHold)))),
    });
    // The ticker: in from below, running, faster and faster.
    const tin = span(to, tHold, tHold + 0.45, EASE.settle);
    st.set("#wt-ticker", { transform: `translateY(${px((1 - tin) * 90 + 300 * drop)})`, ...fade(tin * away) });
    st.set("#wt-strip", { transform: `translateX(${px(-tickerAt(Math.max(0, to - tHold)))})` });
    // Its chips blink beside it.
    [0, 1].forEach((i) => {
      const s = to - (tFaster + i * 0.35);
      const on = s < 0 ? 0 : s < 0.9 ? (Math.floor(s / 0.15) % 2 === 0 ? 1 : 0.25) : 1;
      st.set(`#wt-chip-${i}`, { transform: `translateY(${px((1 - span(to, tFaster + i * 0.35, tFaster + i * 0.35 + 0.3, EASE.settle)) * 14 + 300 * drop)})`, ...fade(on * away) });
    });
    // The notifications, one after another, each from its own edge.
    NOTES.forEach((n, i) => {
      const a = tNotes + i * 0.42;
      const p = span(to, a, a + 0.45, EASE.settle);
      const x = n.at[0] + n.from[0] * (1 - p);
      const y = n.at[1] + n.from[1] * (1 - p) + 600 * drop;
      st.set(`#wt-note-${n.key}`, { transform: `translate(${px(x)}, ${px(y)}) scale(0.86)`, "transform-origin": "0 0", ...fade(span(to, a, a + 0.12, EASE.linear) * away) });
    });
    // The frame dims toward dark, for the drop.
    st.set("#wt-dark", { opacity: r3(0.86 * span(t, tDim, tOut, EASE.linear)) });
    return st;
  };
  return { id: "waits", shots: ["03.1"], palette: "before", html, state };
}

module.exports = waitsScene;
